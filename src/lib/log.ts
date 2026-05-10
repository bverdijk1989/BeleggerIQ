/**
 * Lichtgewicht structured logger. Doel: consistente prefix + payload
 * shape, zodat log-aggregators (Vercel, Sentry, Loki) velden kunnen
 * parsen. Geen dependency op externe loggers; gebruikt `console`.
 *
 * Waarom een thin wrapper?
 * - Voorkomt dat modules zelf `console.warn('[module]', error)` doen met
 *   10 varianten; elke call krijgt `scope + level + message + fields`.
 * - Maakt het makkelijk om later (bij incidenten) één regel aan te
 *   passen en bv. naar Sentry door te sturen.
 *
 * v2 — observability:
 * - Optionele `sink`-laag — caller kan extra transports inhangen
 *   (Sentry, Datadog, custom). Console blijft altijd primair zodat
 *   journalctl/stdout-pipes blijven werken.
 * - Veld-redactie voor `password`, `token`, `secret`, `cookie`,
 *   `authorization`, `apiKey` (case-insensitive). Voorkomt accidental
 *   secret-leak in logs zonder dat callsite per veld moet nadenken.
 */

import { redactDeep } from "@/lib/security/redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

export interface LogEvent {
  level: LogLevel;
  scope: string;
  msg: string;
  fields: LogFields;
  /** ISO 8601 — bewust string, niet Date, om JSON-serialisatie eenvoudig te houden. */
  ts: string;
}

export interface LogSink {
  /** Naam — alleen voor debugging, niet gebruikt voor routing. */
  readonly name: string;
  emit(event: LogEvent): void;
}

// ============================================================
//  Veld-redactie — secrets nooit naar log-output
// ============================================================

const REDACT_KEYS_LOWER = new Set([
  "password",
  "passwd",
  "pwd",
  "token",
  "secret",
  "cookie",
  "set-cookie",
  "authorization",
  "auth",
  "apikey",
  "api_key",
  "access_token",
  "refresh_token",
  "session",
  "x-api-key",
]);

const REDACT_PLACEHOLDER = "[redacted]";
const MAX_DEPTH = 4;

function redactValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Error) {
    // Stack laten we weg — bevat soms paths met user-info en is meestal
    // niet leesbaar in JSON-logs. Errors die je wel met stack wilt
    // sturen → routeer via Sentry-sink.
    return { name: value.name, message: value.message };
  }
  if (depth >= MAX_DEPTH) return "[depth-limited]";
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEYS_LOWER.has(k.toLowerCase())) {
        out[k] = REDACT_PLACEHOLDER;
      } else {
        out[k] = redactValue(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

function redactFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (REDACT_KEYS_LOWER.has(k.toLowerCase())) {
      out[k] = REDACT_PLACEHOLDER;
    } else {
      out[k] = redactValue(v, 1);
    }
  }
  // Defense-in-depth: scrubt PII-patronen in string-VALUES (email/IPv4/Bearer).
  return redactDeep(out);
}

// ============================================================
//  Sink-registry — extra transports naast console
// ============================================================

const sinks: LogSink[] = [];

export function addLogSink(sink: LogSink): void {
  sinks.push(sink);
}

export function clearLogSinksForTest(): void {
  sinks.length = 0;
}

// ============================================================
//  Console-emit — primaire transport
// ============================================================

function emit(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: LogFields,
): void {
  const safeFields = fields ? redactFields(fields) : {};
  const event: LogEvent = {
    level,
    scope,
    msg: message,
    fields: safeFields,
    ts: new Date().toISOString(),
  };
  // Console-payload: flat shape voor backwards-compat met bestaande tests
  // en log-grep-patronen ({ scope, level, msg, ...fields }).
  const consolePayload: Record<string, unknown> = {
    scope,
    level,
    msg: message,
    ...safeFields,
  };
  switch (level) {
    case "debug":
      // eslint-disable-next-line no-console
      console.debug(consolePayload);
      break;
    case "info":
      // eslint-disable-next-line no-console
      console.info(consolePayload);
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(consolePayload);
      break;
    case "error":
      // eslint-disable-next-line no-console
      console.error(consolePayload);
      break;
  }

  // Fan-out naar registered sinks. Falen van een sink mag de logger
  // nooit opblazen — anders verbreek je console-logging als bv. Sentry
  // even unreachable is.
  for (const sink of sinks) {
    try {
      sink.emit(event);
    } catch (_err) {
      // eslint-disable-next-line no-console
      console.error({ scope: "log", level: "error", msg: "sink_emit_failed", sink: sink.name });
    }
  }
}

export const log = {
  debug: (scope: string, message: string, fields?: LogFields) =>
    emit("debug", scope, message, fields),
  info: (scope: string, message: string, fields?: LogFields) =>
    emit("info", scope, message, fields),
  warn: (scope: string, message: string, fields?: LogFields) =>
    emit("warn", scope, message, fields),
  error: (scope: string, message: string, fields?: LogFields) =>
    emit("error", scope, message, fields),
};
