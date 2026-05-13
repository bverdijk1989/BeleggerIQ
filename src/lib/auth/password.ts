/**
 * Password-based login — bcrypt hash + verify.
 *
 * **Naast magic-link + OAuth**: gebruiker kan kiezen, alle drie werken
 * op dezelfde `biq_session`-cookie (HMAC-signed, Module 15).
 *
 * **Security**:
 *  - bcrypt cost-factor 12 (2^12 = 4096 rondes, ~250ms compute)
 *  - Timing-safe compare via bcrypt's eigen `compare`
 *  - Generic error op fail — geen "user bestaat niet" leak
 *  - Rate-limit op IP+email via bestaande auth/rate-limit
 *  - Minimum length 12 chars (NIST recommendation 2024)
 *
 * **NIET geschikt voor**:
 *  - Password reset zonder SMTP (vereist mail-delivery)
 *  - "Forgot password"-flow zonder externe afhankelijkheid
 *  Workaround: admin re-set via CLI-script `scripts/set-user-password.ts`
 */

import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;

export interface PasswordPolicyResult {
  ok: boolean;
  error?: string;
}

/**
 * Valideer een raw password tegen onze policy. Geen complexity-rules
 * (geen "minstens 1 hoofdletter + cijfer" — moderne NIST-richtlijnen
 * adviseren juist GEEN complexity-rules want ze leiden tot zwakkere
 * passwords). Alleen length-bounds.
 */
export function validatePasswordPolicy(
  password: string,
): PasswordPolicyResult {
  if (typeof password !== "string") {
    return { ok: false, error: "Wachtwoord ontbreekt." };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Wachtwoord moet minimaal ${MIN_PASSWORD_LENGTH} tekens zijn.`,
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Wachtwoord mag maximaal ${MAX_PASSWORD_LENGTH} tekens zijn.`,
    };
  }
  // Geen complexity-rules. Length is wat telt.
  return { ok: true };
}

/**
 * Hash een raw password. Geeft `null` als policy faalt.
 */
export async function hashPassword(
  rawPassword: string,
): Promise<{ ok: true; hash: string } | { ok: false; error: string }> {
  const policy = validatePasswordPolicy(rawPassword);
  if (!policy.ok) {
    return { ok: false, error: policy.error ?? "Ongeldig wachtwoord." };
  }
  const hash = await bcrypt.hash(rawPassword, BCRYPT_COST);
  return { ok: true, hash };
}

/**
 * Verifieer raw password tegen stored hash. Returnt `true` bij match.
 * Timing-safe via bcrypt's eigen compare.
 *
 * **Belangrijk**: caller moet de raw password NIET loggen, ook niet bij fail.
 */
export async function verifyPassword(
  rawPassword: string,
  storedHash: string,
): Promise<boolean> {
  if (!rawPassword || !storedHash) return false;
  // Defensive: lege of malformed hashes mogen niet crashen.
  try {
    return await bcrypt.compare(rawPassword, storedHash);
  } catch {
    return false;
  }
}

export const PASSWORD_POLICY = {
  MIN_LENGTH: MIN_PASSWORD_LENGTH,
  MAX_LENGTH: MAX_PASSWORD_LENGTH,
  BCRYPT_COST,
} as const;
