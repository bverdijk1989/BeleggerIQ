import { log } from "@/lib/log";

import { yahooClient } from "./providers/yahoo-client";
import { withRetry, withTimeout } from "./resilience";
import { lookupOverride } from "./symbol-overrides";

/**
 * Symbol-resolver voor de Yahoo provider. Vertaalt een user-facing ticker
 * (zoals DEGIRO die exporteert — vaak een verkorte naam als "VANGUARD" of
 * "NVIDIA") naar een echt Yahoo-symbool ("VUSA.AS", "NVDA") op basis van
 * bij voorkeur de ISIN.
 *
 * Retourneert niet alleen het symbool, maar ook `quoteType` en `exchange`
 * uit Yahoo's search-response. Die meta-data wordt door de
 * instrument-enrichment laag gebruikt om asset class en region vast te
 * stellen zonder een aparte round-trip.
 *
 * Resolutie-volgorde:
 *   1. Cache-hit op (ticker, isin) → direct terug.
 *   2. ISIN-zoekopdracht via Yahoo search → eerste resultaat is kanoniek.
 *   3. Fallback: ticker-zoekopdracht. Minder accuraat (kan verkeerde beurs
 *      opleveren), maar beter dan niets.
 *   4. Alles faalt → retourneer originele ticker zonder meta.
 *
 * De cache leeft per-process. Voor productie met 1 VPS is dat voldoende;
 * voor multi-instance setups zou dit naar Redis moeten.
 */

export interface ResolvedSymbol {
  /** Kanoniek Yahoo symbool, bv. "VUSA.AS" of "NVDA". */
  symbol: string;
  /** Beurs-code uit Yahoo search, bv. "AMS", "NYQ". `null` bij miss. */
  exchange: string | null;
  /** Yahoo quoteType: EQUITY, ETF, MUTUALFUND, CRYPTOCURRENCY, ... */
  quoteType: string | null;
  /** Displayable korte naam uit Yahoo search, `null` bij miss. */
  shortName: string | null;
  /** `true` als de match uit een Yahoo-lookup kwam; `false` bij fallback. */
  matched: boolean;
}

type ResolverCacheValue = ResolvedSymbol | null;

const resolverCache = new Map<string, ResolverCacheValue>();

const RESOLVE_TIMEOUT_MS = 8_000;

function cacheKey(ticker: string, isin?: string | null): string {
  return isin ? `isin:${isin.toUpperCase()}` : `ticker:${ticker.toUpperCase()}`;
}

interface YahooSearchHit {
  symbol?: string;
  exchange?: string;
  quoteType?: string;
  shortname?: string;
  longname?: string;
}

interface YahooSearchResult {
  quotes?: YahooSearchHit[];
}

async function searchYahoo(query: string): Promise<YahooSearchHit | null> {
  try {
    const raw = await withRetry(
      () => withTimeout(yahooClient.search(query), RESOLVE_TIMEOUT_MS),
      { scope: "yahoo:resolve", retries: 1, baseDelayMs: 200, maxDelayMs: 500 },
    );
    const result = raw as YahooSearchResult | undefined;
    const first = result?.quotes?.find((q) => typeof q.symbol === "string");
    return first ?? null;
  } catch (error) {
    log.warn("symbol-resolver", "search failed", { query, error });
    return null;
  }
}

function toResolved(hit: YahooSearchHit): ResolvedSymbol {
  return {
    symbol: hit.symbol ?? "",
    exchange: hit.exchange ?? null,
    quoteType: hit.quoteType ?? null,
    shortName: hit.shortname ?? hit.longname ?? null,
    matched: true,
  };
}

function unmatched(ticker: string): ResolvedSymbol {
  return {
    symbol: ticker,
    exchange: null,
    quoteType: null,
    shortName: null,
    matched: false,
  };
}

/**
 * Resolve één ticker+ISIN naar een volledig `ResolvedSymbol`-record. Cache'd
 * per (ticker, isin). Bij een miss retourneert `matched: false` met het
 * originele ticker als fallback.
 */
export async function resolveYahooMatch(
  ticker: string,
  isin?: string | null,
): Promise<ResolvedSymbol> {
  if (process.env.MARKET_DATA_PROVIDER !== "yahoo") return unmatched(ticker);

  const key = cacheKey(ticker, isin);
  if (resolverCache.has(key)) {
    return resolverCache.get(key) ?? unmatched(ticker);
  }

  // 0) Manuele override — hoogste prioriteit. Yahoo hoeft niet bevraagd
  //    te worden wanneer we al weten welke symbol correct is voor deze
  //    holding (bv. verkeerde exchange in Yahoo's first-match).
  const override = lookupOverride(ticker, isin);
  if (override) {
    const resolved: ResolvedSymbol = {
      symbol: override,
      exchange: null,
      quoteType: null,
      shortName: null,
      matched: true,
    };
    resolverCache.set(key, resolved);
    return resolved;
  }

  // 1) ISIN-prioriteit.
  if (isin) {
    const hit = await searchYahoo(isin);
    if (hit?.symbol) {
      const resolved = toResolved(hit);
      resolverCache.set(key, resolved);
      return resolved;
    }
  }

  // 2) Fallback: ticker/naam als search query.
  const byTicker = await searchYahoo(ticker);
  if (byTicker?.symbol) {
    const resolved = toResolved(byTicker);
    resolverCache.set(key, resolved);
    return resolved;
  }

  // 3) Niks gevonden — negative cache, fallback original.
  resolverCache.set(key, null);
  return unmatched(ticker);
}

/**
 * Back-compat API: retourneert alleen het symbool (string). Voor callers die
 * geen meta-info nodig hebben.
 */
export async function resolveYahooSymbol(
  ticker: string,
  isin?: string | null,
): Promise<string> {
  const match = await resolveYahooMatch(ticker, isin);
  return match.symbol;
}

/**
 * Bulk-variant. Parallel met Promise.all; per item doet dezelfde lookup.
 * Handig in enrichment waar we in één pass alle holdings resolven voordat
 * we quotes/fundamentals/history fetchen.
 */
export async function resolveYahooSymbols(
  items: Array<{ ticker: string; isin?: string | null }>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (process.env.MARKET_DATA_PROVIDER !== "yahoo") {
    for (const item of items) out.set(item.ticker, item.ticker);
    return out;
  }

  await Promise.all(
    items.map(async (item) => {
      const match = await resolveYahooMatch(item.ticker, item.isin);
      out.set(item.ticker, match.symbol);
    }),
  );
  return out;
}

// ============================================================
//  Normalisatie + asset-class detectie
// ============================================================

/**
 * Normaliseer een Yahoo `quoteType` naar onze `AssetClass` enum.
 * Yahoo kent o.a. EQUITY / ETF / MUTUALFUND / INDEX / CURRENCY / CRYPTOCURRENCY /
 * FUTURE. Onbekend → null zodat de caller kan beslissen over fallback.
 */
export function detectAssetClassFromQuoteType(
  quoteType: string | null | undefined,
):
  | "EQUITY"
  | "ETF"
  | "BOND"
  | "REIT"
  | "COMMODITY"
  | "CRYPTO"
  | "CASH"
  | "OTHER"
  | null {
  if (!quoteType) return null;
  const upper = quoteType.toUpperCase();
  switch (upper) {
    case "EQUITY":
      return "EQUITY";
    case "ETF":
      return "ETF";
    case "MUTUALFUND":
      return "ETF"; // semantisch dichtst bij, beide zijn gepoolde fondsen
    case "CRYPTOCURRENCY":
      return "CRYPTO";
    case "FUTURE":
    case "COMMODITY":
      return "COMMODITY";
    case "CURRENCY":
      return "CASH";
    case "INDEX":
      return "OTHER";
    default:
      return null;
  }
}

/**
 * Heuristische asset-class detectie op basis van de naam — fallback wanneer
 * Yahoo geen `quoteType` levert. Minder accuraat dan de provider-versie
 * maar betrouwbaarder dan "alles is EQUITY".
 */
export function detectAssetClassFromName(
  name: string,
): "EQUITY" | "ETF" | "BOND" | "OTHER" {
  const upper = name.toUpperCase();
  if (/\b(ETF|UCITS|TRACKER|INDEX FUND)\b/.test(upper)) return "ETF";
  if (/\b(BOND|OBLIGATIE|GILT|TREASURY|NOTE)\b/.test(upper)) return "BOND";
  if (/\b(REIT|REAL ESTATE TRUST)\b/.test(upper)) return "OTHER";
  return "EQUITY";
}

/**
 * Normaliseer een Yahoo `exchange`-code naar een stabiele region-bucket.
 * Bewust grofmazig — het doel is portfolio-allocatie per regio, niet
 * beurs-accuratesse.
 */
export function detectRegionFromExchange(
  exchange: string | null | undefined,
):
  | "North America"
  | "Europe"
  | "UK"
  | "Asia"
  | "Emerging Markets"
  | "Global"
  | null {
  if (!exchange) return null;
  const upper = exchange.toUpperCase();
  // Yahoo levert codes als NYQ (NYSE), NMS (NASDAQ), AMS, LSE, FRA, PAR, MIL, etc.
  if (["NYQ", "NMS", "NYSE", "NAS", "NGM", "PCX", "ASE"].includes(upper))
    return "North America";
  if (upper === "TOR" || upper === "CNQ" || upper === "TSX") return "North America";
  if (["LSE", "IOB"].includes(upper)) return "UK";
  if (
    ["AMS", "FRA", "GER", "PAR", "EPA", "MIL", "MCE", "STO", "CPH", "HEL", "OSL", "VIE", "SWX", "EBS", "BRU", "LIS"].includes(
      upper,
    )
  )
    return "Europe";
  if (["TYO", "JPX", "HKG", "SHA", "SHG", "SHZ", "KSC", "KOE", "TPE", "BSE", "NSI"].includes(upper))
    return "Asia";
  if (["JKT", "SAO", "JNB", "MOC", "KLS", "SES"].includes(upper))
    return "Emerging Markets";
  return null;
}

/**
 * Voeg een exchange-suffix aan een kale ticker toe wanneer die op een
 * niet-US beurs noteert en de user er zonder suffix op zoekt. Yahoo
 * vereist bv. "ASML.AS" voor Amsterdam — zonder suffix krijg je de
 * Amerikaanse ADR-notering (die soms niet bestaat).
 *
 * Het mapping-tabel is klein en explicit; bij een niet-gelistete exchange
 * retourneren we de input ongewijzigd i.p.v. te gokken.
 */
const EXCHANGE_TO_SUFFIX: Record<string, string> = {
  AMS: ".AS",
  EPA: ".PA",
  PAR: ".PA",
  GER: ".DE",
  FRA: ".DE",
  MIL: ".MI",
  MCE: ".MC",
  LSE: ".L",
  IOB: ".IL",
  SWX: ".SW",
  EBS: ".SW",
  STO: ".ST",
  CPH: ".CO",
  HEL: ".HE",
  OSL: ".OL",
  VIE: ".VI",
  TOR: ".TO",
  TYO: ".T",
  HKG: ".HK",
};

export function normalizeTickerForExchange(
  ticker: string,
  exchange: string | null | undefined,
): string {
  if (!exchange) return ticker;
  const suffix = EXCHANGE_TO_SUFFIX[exchange.toUpperCase()];
  if (!suffix) return ticker;
  // Als de ticker al ergens een punt bevat, laat 'm met rust —
  // de user heeft al een expliciete suffix meegegeven.
  if (ticker.includes(".")) return ticker;
  return `${ticker}${suffix}`;
}

/** Testhaak — leegt de in-memory cache. */
export function resetSymbolResolverCache(): void {
  resolverCache.clear();
}
