/**
 * Country-resolver — ISIN/ticker → ISO 3166-1 alpha-2 country.
 *
 * Voor box-3 dividend-rapportage hebben we per dividend-rij het bron-
 * land nodig: dat bepaalt het standaard inhoudingspercentage en welk
 * deel verrekenbaar is via Nederlandse belastingverdragen.
 *
 * Bronvolgorde:
 *   1. ISIN (eerste 2 chars) — formeel correct, broker-independent.
 *   2. Ticker-suffix heuristiek — `.AS` (Euronext Amsterdam → NL),
 *      `.DE` (Xetra → DE), etc. Alleen wanneer ISIN ontbreekt.
 *   3. `null` — onbepaald; UI toont 'em apart als "Onbekend".
 *
 * Bewust géén live-lookup naar een register: deze module moet pure +
 * synchroon blijven (gebruikt door zowel server-side aggregator als
 * client-side preview).
 */

const ISIN_REGEX = /^([A-Z]{2})[A-Z0-9]{10}$/;

const TICKER_SUFFIX_TO_COUNTRY: Record<string, string> = {
  AS: "NL", // Amsterdam
  PA: "FR", // Paris
  DE: "DE", // Xetra
  F: "DE",  // Frankfurt
  L: "GB",  // London
  MI: "IT", // Milan
  MC: "ES", // Madrid
  BR: "BE", // Brussels
  LS: "PT", // Lisbon
  HE: "FI", // Helsinki
  ST: "SE", // Stockholm
  CO: "DK", // Copenhagen
  OL: "NO", // Oslo
  SW: "CH", // Swiss
  VX: "CH",
  TO: "CA", // Toronto
  HK: "HK",
  T: "JP",  // Tokyo
};

export function countryFromIsin(isin: string | null | undefined): string | null {
  if (!isin) return null;
  const m = isin.toUpperCase().match(ISIN_REGEX);
  if (!m) return null;
  return m[1] ?? null;
}

export function countryFromTicker(ticker: string | null | undefined): string | null {
  if (!ticker) return null;
  // US listings hebben typisch geen suffix.
  const dot = ticker.lastIndexOf(".");
  if (dot === -1) {
    // Heuristiek: 1-5 letters → US (NYSE/Nasdaq); kan fout zijn voor non-US
    // waarbij de broker geen suffix levert. ISIN is altijd betrouwbaarder.
    return /^[A-Z]{1,5}$/.test(ticker.toUpperCase()) ? "US" : null;
  }
  const suffix = ticker.slice(dot + 1).toUpperCase();
  return TICKER_SUFFIX_TO_COUNTRY[suffix] ?? null;
}

/**
 * Combineer beide met ISIN als primaire bron.
 */
export function resolveCountry(input: {
  isin?: string | null;
  ticker?: string | null;
}): string | null {
  const fromIsin = countryFromIsin(input.isin);
  if (fromIsin) return fromIsin;
  return countryFromTicker(input.ticker);
}

const COUNTRY_NAMES: Record<string, string> = {
  NL: "Nederland",
  US: "Verenigde Staten",
  DE: "Duitsland",
  FR: "Frankrijk",
  GB: "Verenigd Koninkrijk",
  CH: "Zwitserland",
  BE: "België",
  IT: "Italië",
  ES: "Spanje",
  CA: "Canada",
  AU: "Australië",
  JP: "Japan",
  HK: "Hong Kong",
  IE: "Ierland",
  LU: "Luxemburg",
  SE: "Zweden",
  NO: "Noorwegen",
  DK: "Denemarken",
  FI: "Finland",
  PT: "Portugal",
};

export function countryName(code: string | null): string {
  if (!code) return "Onbekend";
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}
