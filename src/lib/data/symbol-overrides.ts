/**
 * Manuele overrides voor de symbol-resolver.
 *
 * Wanneer Yahoo's `search()` het verkeerde eerste resultaat teruggeeft
 * (bv. US-ADR i.p.v. de beurs waar jij daadwerkelijk handelt), voeg je
 * hier een override toe. De resolver leest deze tabel **voor** de
 * Yahoo-call — dus een hit hier bespaart een round-trip én vermijdt
 * verkeerde defaults.
 *
 * Prioriteit:
 *   1. `BY_ISIN[isin]`  — meest betrouwbaar, ISIN is uniek wereldwijd.
 *   2. `BY_TICKER[ticker]` — fallback wanneer ISIN ontbreekt in je import.
 *
 * Hoe draai je het validatie-script om te zien waar overrides nodig zijn:
 *
 *     MARKET_DATA_PROVIDER=yahoo npx tsx scripts/validate-symbol-resolution.ts
 *
 * Elke rij met verdict `⚠️ CHECK` of `❌ NO MATCH` is een kandidaat.
 *
 * Na een override: geen code-wijziging elders nodig, wel een deploy +
 * `systemctl restart beleggeriq`. Cache wordt automatisch gerespecteerd
 * omdat de override VÓÓR de cache-check wordt toegepast.
 */

/**
 * Shape: `"isin" → "yahoo-symbol"`. Houd de ISIN in uppercase.
 */
export const BY_ISIN: Record<string, string> = {
  // Voorbeelden (vervang/uitbreiden op basis van je eigen holdings):
  // "IE00B3XXRP09": "VUSA.AS",   // Vanguard S&P 500 UCITS — Amsterdam listing
  // "IE00BK5BQT80": "VWCE.DE",   // Vanguard FTSE All-World — Xetra listing
  // "NL0011540547": "ASML.AS",   // ASML Holding — Amsterdam
};

/**
 * Shape: `"UPPER-CASED-TICKER" → "yahoo-symbol"`. Gebruik dit alleen als de
 * ISIN ontbreekt; ISIN-match is altijd te prefereren.
 */
export const BY_TICKER: Record<string, string> = {
  // "VANGUARD": "VUSA.AS",
  // "NVIDIA": "NVDA",
};

/**
 * Lookup-helper. Retourneert een expliciet override of `null`.
 */
export function lookupOverride(
  ticker: string,
  isin?: string | null,
): string | null {
  if (isin) {
    const isinOverride = BY_ISIN[isin.toUpperCase()];
    if (isinOverride) return isinOverride;
  }
  const tickerOverride = BY_TICKER[ticker.toUpperCase()];
  return tickerOverride ?? null;
}
