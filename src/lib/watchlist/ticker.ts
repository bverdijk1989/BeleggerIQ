/**
 * Pure ticker-validatie + normalisatie voor watchlist-input.
 *
 * Doel: één plek om ruwe user-input te keuren vóór 'em de DB raakt.
 * Een DEGIRO-export levert tickers met suffixes (`.AS`, `.DE`),
 * sommige users typen ze in lowercase — we normaliseren naar uppercase.
 *
 * Veiligheidsnet: we accepteren alleen `[A-Z0-9.\-]{1,16}` zodat geen
 * SQL-injectie-achtige strings (of typos met spaties / quotes)
 * doorglippen naar Yahoo / Prisma.
 */

const TICKER_REGEX = /^[A-Z0-9][A-Z0-9.\-]{0,15}$/;

export type TickerValidation =
  | { ok: true; ticker: string }
  | { ok: false; reason: string };

export function normalizeAndValidateTicker(
  raw: string | null | undefined,
): TickerValidation {
  if (raw === null || raw === undefined) {
    return { ok: false, reason: "Ticker ontbreekt." };
  }
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "Ticker ontbreekt." };
  }
  const upper = trimmed.toUpperCase();
  if (upper.length > 16) {
    return { ok: false, reason: "Ticker te lang (max 16 tekens)." };
  }
  if (!TICKER_REGEX.test(upper)) {
    return {
      ok: false,
      reason: "Ticker mag alleen A-Z, cijfers, '.' of '-' bevatten.",
    };
  }
  return { ok: true, ticker: upper };
}
