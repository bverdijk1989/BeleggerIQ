/**
 * Admin-guard (Module 15).
 *
 * **v1 = env-allowlist**. Adminschapping zit in env-var
 * `BIQ_ADMIN_EMAILS` als comma-separated lijst. Eenvoudig, transparant,
 * audit-traceerbaar (vereist deployment om iemand admin te maken).
 *
 * **v2-pad**: een `User.role: ADMIN`-veld of een dedicated `AdminUser`-
 * tabel. Migratie-pad gedocumenteerd in `docs/ADMIN_CONSOLE.md`.
 *
 * **Bewuste keuze geen `isAdmin` op `User`-record**: een DB-flag is
 * eenvoudig op te tonen door een lek (SQL-injection, bug), terwijl een
 * env-allowlist alleen muteerbaar is via deployment. Voor v1 — met
 * <20 actieve users — is dit veiliger.
 */

import type { AdminContext } from "./types";

const ADMIN_EMAILS_ENV = "BIQ_ADMIN_EMAILS";

/**
 * Lees de env-allowlist (lazy — bij elke call). Tolerant t.a.v.
 * whitespace en case (case-insensitive vergelijking).
 */
function parseAllowlist(envValue: string | undefined): Set<string> {
  if (!envValue || envValue.trim().length === 0) return new Set();
  return new Set(
    envValue
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

/**
 * Pure-function check — geen DB-call. Caller geeft email + (optioneel)
 * de env-waarde door zodat tests kunnen overriden.
 */
export function isAdminEmail(
  email: string | null | undefined,
  envValue: string | undefined = process.env[ADMIN_EMAILS_ENV],
): AdminContext {
  const normalized = (email ?? "").trim().toLowerCase();
  if (normalized.length === 0) {
    return { email: "", isAdmin: false, source: "none" };
  }
  const allowlist = parseAllowlist(envValue);
  if (allowlist.has(normalized)) {
    return { email: normalized, isAdmin: true, source: "env_allowlist" };
  }
  return { email: normalized, isAdmin: false, source: "none" };
}

/**
 * PII-masker voor support-info — toont `b***@example.com`-stijl.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "(onbekend)";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "(onbekend)";
  if (local.length <= 1) return `*@${domain}`;
  return `${local[0]}${"*".repeat(Math.min(local.length - 1, 3))}@${domain}`;
}
