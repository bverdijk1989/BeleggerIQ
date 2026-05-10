/**
 * Error-sanitizer voor server-action responses.
 *
 * **Probleem**: een aantal server-actions returnde ruwe `error.message`
 * naar de client, wat stack-info / DB-paths / interne feldnamen kon
 * lekken. Deze helper maakt een safe-by-default response met een
 * generieke melding én logt de raw fout via de logger.
 *
 * Gebruik:
 * ```ts
 * try { ... } catch (error) {
 *   return sanitizeActionError(error, { scope: "portfolio", action: "import_csv" });
 * }
 * ```
 */

import { log } from "@/lib/log";

export interface SanitizedActionError {
  ok: false;
  error: string;
  /** Stable error-code voor UI-routing (bv. "INTERNAL_ERROR" → toon generieke alert). */
  code: string;
}

export interface SanitizeOptions {
  scope: string;
  action: string;
  /** Default user-facing tekst. */
  fallbackMessage?: string;
  /** Stable error-code (default INTERNAL_ERROR). */
  code?: string;
  /** Allowlist: deze foutmeldingen mogen WEL doorgaan naar de client
   *  omdat ze user-friendly + niet gevoelig zijn. Match op exact-string. */
  allowlist?: ReadonlyArray<string>;
  /** Extra log-fields. */
  logFields?: Record<string, unknown>;
}

const DEFAULT_FALLBACK = "Er ging iets mis. Probeer het opnieuw.";
const DEFAULT_CODE = "INTERNAL_ERROR";

export function sanitizeActionError(
  error: unknown,
  opts: SanitizeOptions,
): SanitizedActionError {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const userMessage =
    opts.allowlist && opts.allowlist.includes(rawMessage)
      ? rawMessage
      : (opts.fallbackMessage ?? DEFAULT_FALLBACK);

  log.error(opts.scope, `${opts.action}_failed`, {
    rawMessage,
    name: error instanceof Error ? error.name : "non-error",
    ...(opts.logFields ?? {}),
  });

  return {
    ok: false,
    error: userMessage,
    code: opts.code ?? DEFAULT_CODE,
  };
}
