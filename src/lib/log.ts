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
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  [key: string]: unknown;
}

function emit(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: LogFields,
): void {
  const payload: LogFields = { scope, level, msg: message };
  if (fields) {
    for (const [k, v] of Object.entries(fields)) {
      payload[k] = v instanceof Error ? { name: v.name, message: v.message } : v;
    }
  }
  switch (level) {
    case "debug":
      // eslint-disable-next-line no-console
      console.debug(payload);
      break;
    case "info":
      // eslint-disable-next-line no-console
      console.info(payload);
      break;
    case "warn":
      // eslint-disable-next-line no-console
      console.warn(payload);
      break;
    case "error":
      // eslint-disable-next-line no-console
      console.error(payload);
      break;
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
