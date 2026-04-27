import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { prisma } from "@/lib/data/prisma";

/**
 * Magic-link token-utils. Pure waar mogelijk — alleen de DB-mutaties
 * raken Prisma.
 *
 * Threat-model:
 *  - **Token-leakage** (DB-dump): we slaan alleen de SHA-256-hash op,
 *    nooit het ruwe token. Een aanvaller met DB-toegang kan geen
 *    geldige magic-links uit de hashes reconstrueren.
 *  - **Replay**: `usedAt` wordt gezet bij eerste exchange; daarna
 *    worden re-uses afgewezen.
 *  - **Brute-force**: token = 32 random bytes (256 bit entropy);
 *    base64url-encoded ~43 chars.
 *  - **Expiry**: default 15 min via `MAGIC_LINK_TTL_MINUTES`.
 */

export const MAGIC_LINK_TTL_MS_DEFAULT = 15 * 60 * 1000;

export const RAW_TOKEN_BYTES = 32;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function generateRawToken(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip || ip.length === 0) return null;
  return createHash("sha256").update(ip).digest("hex");
}

export interface IssueMagicLinkInput {
  email: string;
  ip?: string | null;
  ttlMs?: number;
  /** Override `now` voor deterministische tests. */
  now?: Date;
}

export interface IssueMagicLinkResult {
  /** Het ruwe token — eenmalig terug aan caller voor verzending. */
  rawToken: string;
  /** DB-record id voor logging/telemetry. */
  id: string;
  expiresAt: Date;
}

/**
 * Maakt een nieuw magic-link-token aan en slaat de hash op.
 * Caller moet `rawToken` in de e-mail-link verwerken; de waarde
 * verlaat deze functie maar één keer.
 */
export async function issueMagicLink(
  input: IssueMagicLinkInput,
): Promise<IssueMagicLinkResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    throw new Error("Ongeldig e-mailadres.");
  }
  const now = input.now ?? new Date();
  const ttlMs = input.ttlMs ?? MAGIC_LINK_TTL_MS_DEFAULT;
  const expiresAt = new Date(now.getTime() + ttlMs);
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const ipHash = hashIp(input.ip);

  const row = await prisma.magicLinkToken.create({
    data: {
      email,
      tokenHash,
      expiresAt,
      ipHash,
      createdAt: now,
    },
  });

  return { rawToken, id: row.id, expiresAt };
}

export type ConsumeFailure =
  | "INVALID"
  | "EXPIRED"
  | "ALREADY_USED";

export type ConsumeResult =
  | { ok: true; email: string; id: string }
  | { ok: false; reason: ConsumeFailure };

export interface ConsumeMagicLinkInput {
  rawToken: string;
  /** Override `now` voor deterministische tests. */
  now?: Date;
}

/**
 * Verifieert + consumeert een magic-link-token. Single-use:
 * markeert direct `usedAt` zodra de match is gelukt.
 *
 * Volgorde:
 *  1. Hash matcht → bestaat token-record? Zo niet: INVALID.
 *  2. Reeds gebruikt? ALREADY_USED.
 *  3. Verlopen? EXPIRED.
 *  4. Constant-time email-confirm + zet `usedAt`.
 */
export async function consumeMagicLink(
  input: ConsumeMagicLinkInput,
): Promise<ConsumeResult> {
  const tokenHash = hashToken(input.rawToken);
  const now = input.now ?? new Date();

  const row = await prisma.magicLinkToken.findFirst({
    where: { tokenHash },
  });
  if (!row) return { ok: false, reason: "INVALID" };

  // Timing-safe vergelijking op de hash zelf — voorkomt timing-leak
  // doordat findFirst al case-sensitief is, maar we beschermen tegen
  // toekomstige indexing-aanpassingen.
  const expected = Buffer.from(row.tokenHash, "hex");
  const provided = Buffer.from(tokenHash, "hex");
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(expected, provided)
  ) {
    return { ok: false, reason: "INVALID" };
  }

  if (row.usedAt) return { ok: false, reason: "ALREADY_USED" };
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "EXPIRED" };
  }

  await prisma.magicLinkToken.update({
    where: { id: row.id },
    data: { usedAt: now },
  });

  return { ok: true, email: row.email, id: row.id };
}

/**
 * Housekeeping: verwijder verlopen + reeds gebruikte tokens ouder
 * dan `olderThanMs`. Wordt doorgaans uit een cron aangeroepen.
 */
export async function reapMagicLinks(
  olderThanMs: number = 24 * 60 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const result = await prisma.magicLinkToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: cutoff } },
        { usedAt: { lt: cutoff } },
      ],
    },
  });
  return result.count;
}
