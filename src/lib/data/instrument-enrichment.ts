import { log } from "@/lib/log";
import type { Currency } from "@/types/common";
import type { AssetClass } from "@/types/portfolio";

import { buildCacheKey, marketDataCache } from "./cache";
import { yahooClient } from "./providers/yahoo-client";
import { withRetry, withTimeout } from "./resilience";
import {
  detectAssetClassFromName,
  detectAssetClassFromQuoteType,
  detectRegionFromExchange,
  resolveYahooMatch,
  type ResolvedSymbol,
} from "./symbol-resolver";

/**
 * Instrument-enrichment module.
 *
 * Gegeven een (ticker, isin, name?)-tuple produceert deze module een
 * `EnrichedInstrument`-record met sector, industrie, regio, asset class,
 * exchange, beurs-genormaliseerd ticker, en een *confidence score*.
 *
 * Design-principes:
 *  - **Geen verzonnen data**: alle velden zijn óf provider-backed, óf
 *    afgeleid via expliciete heuristieken uit de ticker-naam. Als een
 *    veld ontbreekt is 'ie `null`, niet een geraden waarde.
 *  - **Confidence = gevuldheid**: het aantal non-null velden gedeeld door
 *    het aantal gevraagde velden. Callers kunnen hun eigen drempels zetten.
 *  - **Multi-source provenance**: `sources` lijst toont welke lagen data
 *    hebben bijgedragen (yahoo-search, yahoo-profile, ticker-heuristic).
 *  - **Gecached**: 6 uur TTL. Sector/industry wijzigen bijna nooit; de
 *    cache houdt de load op Yahoo laag.
 *  - **Fallback zonder crash**: elke fetch heeft try/catch. Een thrown
 *    Yahoo-call verlaagt confidence maar breekt nooit de batch.
 */

export type Region =
  | "North America"
  | "Europe"
  | "UK"
  | "Asia"
  | "Emerging Markets"
  | "Global"
  | "Unknown";

export type EnrichmentSource =
  | "yahoo-search"
  | "yahoo-profile"
  | "ticker-heuristic"
  | "input";

export interface EnrichedInstrument {
  /** Oorspronkelijke ticker zoals de user 'm kent. */
  ticker: string;
  /** Kanoniek Yahoo-symbool, bv. "VUSA.AS". */
  normalizedTicker: string;
  isin: string | null;
  name: string | null;
  assetClass: AssetClass;
  /** Raw Yahoo quoteType voor audit (EQUITY/ETF/MUTUALFUND/...). */
  quoteType: string | null;
  exchange: string | null;
  currency: Currency | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  region: Region;
  /** Provider-confidence 0..1: fractie gevulde kernvelden. */
  confidence: number;
  sources: EnrichmentSource[];
  warnings: string[];
  enrichedAt: string;
}

const NAMESPACE = "instrument-enrichment";
const TTL_SECONDS = 6 * 60 * 60; // 6 uur
const QUOTE_SUMMARY_TIMEOUT_MS = 8_000;

/** Yahoo `assetProfile` module — alleen de velden die we consumeren. */
interface YahooAssetProfile {
  sector?: string;
  industry?: string;
  country?: string;
  city?: string;
  website?: string;
  longBusinessSummary?: string;
}

interface YahooPriceBlock {
  currency?: string;
  exchange?: string;
  exchangeName?: string;
  quoteType?: string;
  shortName?: string;
  longName?: string;
}

interface YahooFundProfile {
  family?: string;
  categoryName?: string;
  legalType?: string;
}

interface YahooProfileResponse {
  assetProfile?: YahooAssetProfile;
  price?: YahooPriceBlock;
  fundProfile?: YahooFundProfile;
  summaryProfile?: YahooAssetProfile;
}

export interface EnrichInstrumentInput {
  ticker: string;
  isin?: string | null;
  name?: string | null;
}

/**
 * Enrich één instrument. Cache'd per `(symbol, isin)`. Retourneert
 * altijd een `EnrichedInstrument` — zelfs bij een volledige lookup-miss,
 * zodat de caller kan bepalen wat er met lage confidence gebeurt (UI
 * toont "onbekend" badge i.p.v. crash).
 */
export async function enrichInstrument(
  input: EnrichInstrumentInput,
): Promise<EnrichedInstrument> {
  const key = buildCacheKey(
    NAMESPACE,
    input.isin ?? input.ticker,
    input.ticker,
  );

  return marketDataCache.getOrSet(key, TTL_SECONDS, () => computeEnrichment(input));
}

/**
 * Bulk-variant. Parallel per item; dedupes niet verder omdat de cache dat
 * al afhandelt (zelfde ticker+isin → zelfde key).
 */
export async function enrichInstruments(
  items: EnrichInstrumentInput[],
): Promise<Map<string, EnrichedInstrument>> {
  const out = new Map<string, EnrichedInstrument>();
  await Promise.all(
    items.map(async (item) => {
      const enriched = await enrichInstrument(item);
      out.set(item.ticker, enriched);
    }),
  );
  return out;
}

// ============================================================
//  Internals
// ============================================================

async function computeEnrichment(
  input: EnrichInstrumentInput,
): Promise<EnrichedInstrument> {
  const sources: EnrichmentSource[] = ["input"];
  const warnings: string[] = [];

  // 1) Resolve via symbol-resolver (search endpoint).
  const match = await resolveYahooMatch(input.ticker, input.isin);
  if (match.matched) sources.push("yahoo-search");
  else warnings.push("Yahoo search vond geen canonical symbol.");

  // 2) Haal assetProfile + price + fundProfile bij het gevonden symbool.
  const profile = match.matched
    ? await fetchProfile(match.symbol)
    : null;
  if (profile) sources.push("yahoo-profile");
  else if (match.matched) warnings.push("Yahoo assetProfile leverde niets.");

  // 3) Combineer tot een gesloten record.
  const assetClass = resolveAssetClass({ match, profile, name: input.name ?? match.shortName });
  const region = resolveRegion({ match, profile });

  const enriched: EnrichedInstrument = {
    ticker: input.ticker,
    normalizedTicker: match.symbol,
    isin: input.isin ?? null,
    name:
      input.name ??
      profile?.price?.longName ??
      profile?.price?.shortName ??
      match.shortName ??
      null,
    assetClass,
    quoteType: match.quoteType ?? profile?.price?.quoteType ?? null,
    exchange:
      match.exchange ??
      profile?.price?.exchange ??
      profile?.price?.exchangeName ??
      null,
    currency: normalizeCurrency(profile?.price?.currency ?? null),
    sector:
      profile?.assetProfile?.sector ??
      profile?.summaryProfile?.sector ??
      null,
    industry:
      profile?.assetProfile?.industry ??
      profile?.summaryProfile?.industry ??
      null,
    country:
      profile?.assetProfile?.country ??
      profile?.summaryProfile?.country ??
      null,
    region,
    confidence: 0, // berekend hieronder
    sources,
    warnings,
    enrichedAt: new Date().toISOString(),
  };

  enriched.confidence = computeConfidence(enriched);
  // Voor ETFs is het ontbreken van sector/industry verwacht gedrag; geen
  // ruis-warning. Voor aandelen wel.
  if (assetClass === "EQUITY" && !enriched.sector) {
    warnings.push("Sector ontbreekt — factor-attribution per sector onvolledig.");
  }
  return enriched;
}

async function fetchProfile(symbol: string): Promise<YahooProfileResponse | null> {
  try {
    const raw = await withRetry(
      () =>
        withTimeout(
          yahooClient.quoteSummary(symbol, {
            modules: ["assetProfile", "summaryProfile", "price", "fundProfile"],
          }),
          QUOTE_SUMMARY_TIMEOUT_MS,
        ),
      { scope: "yahoo:profile", retries: 1, baseDelayMs: 200, maxDelayMs: 800 },
    );
    return (raw as YahooProfileResponse | undefined) ?? null;
  } catch (error) {
    log.warn("instrument-enrichment", "profile fetch failed", { symbol, error });
    return null;
  }
}

function resolveAssetClass(ctx: {
  match: ResolvedSymbol;
  profile: YahooProfileResponse | null;
  name?: string | null;
}): AssetClass {
  // Voorkeur: Yahoo quoteType via search.
  const fromQuote = detectAssetClassFromQuoteType(ctx.match.quoteType);
  if (fromQuote) return fromQuote;

  // Tweede keuze: quoteType in price-block.
  const fromPrice = detectAssetClassFromQuoteType(ctx.profile?.price?.quoteType);
  if (fromPrice) return fromPrice;

  // fundProfile aanwezig = ETF/fund (ongeacht quoteType ontbreken).
  if (ctx.profile?.fundProfile) return "ETF";

  // Naam-heuristiek als laatste redmiddel.
  if (ctx.name) {
    const fromName = detectAssetClassFromName(ctx.name);
    if (fromName !== "EQUITY") return fromName;
    // EQUITY is default — geef pas af als niets anders paste.
    return "EQUITY";
  }

  return "OTHER";
}

function resolveRegion(ctx: {
  match: ResolvedSymbol;
  profile: YahooProfileResponse | null;
}): Region {
  // Voorkeur: country uit assetProfile (accurater dan exchange voor
  // holding-companies die wereldwijd opereren).
  const country =
    ctx.profile?.assetProfile?.country ??
    ctx.profile?.summaryProfile?.country ??
    null;
  if (country) {
    const byCountry = detectRegionFromCountry(country);
    if (byCountry) return byCountry;
  }

  // Tweede keuze: exchange.
  const exchange =
    ctx.match.exchange ??
    ctx.profile?.price?.exchange ??
    ctx.profile?.price?.exchangeName ??
    null;
  const byExchange = detectRegionFromExchange(exchange);
  if (byExchange) return byExchange;

  return "Unknown";
}

/**
 * Mapping van Yahoo's country-string (bv. "United States", "Netherlands")
 * naar region-bucket. Dekking: top-30 markten; onbekend → null.
 */
function detectRegionFromCountry(country: string): Region | null {
  const normalized = country.trim();
  const upper = normalized.toUpperCase();

  const NORTH_AMERICA = new Set(["UNITED STATES", "USA", "US", "CANADA"]);
  const UK = new Set(["UNITED KINGDOM", "UK", "GREAT BRITAIN", "ENGLAND"]);
  const EUROPE = new Set([
    "NETHERLANDS",
    "GERMANY",
    "FRANCE",
    "BELGIUM",
    "LUXEMBOURG",
    "IRELAND",
    "ITALY",
    "SPAIN",
    "PORTUGAL",
    "SWITZERLAND",
    "AUSTRIA",
    "DENMARK",
    "SWEDEN",
    "NORWAY",
    "FINLAND",
    "ICELAND",
    "GREECE",
    "POLAND",
    "CZECH REPUBLIC",
    "CZECHIA",
  ]);
  const ASIA = new Set([
    "JAPAN",
    "HONG KONG",
    "SINGAPORE",
    "SOUTH KOREA",
    "TAIWAN",
    "CHINA",
    "INDIA",
  ]);
  const EMERGING = new Set([
    "BRAZIL",
    "MEXICO",
    "SOUTH AFRICA",
    "TURKEY",
    "INDONESIA",
    "THAILAND",
    "MALAYSIA",
    "PHILIPPINES",
    "RUSSIA",
  ]);

  if (NORTH_AMERICA.has(upper)) return "North America";
  if (UK.has(upper)) return "UK";
  if (EUROPE.has(upper)) return "Europe";
  if (ASIA.has(upper)) return "Asia";
  if (EMERGING.has(upper)) return "Emerging Markets";
  return null;
}

const SUPPORTED_CURRENCIES: ReadonlySet<Currency> = new Set([
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "JPY",
]);

function normalizeCurrency(raw: string | null | undefined): Currency | null {
  if (!raw) return null;
  const upper = raw.toUpperCase();
  // Yahoo levert voor LSE-tickers "GBp" (pence); behandel als GBP.
  if (upper === "GBP" || raw === "GBp") return "GBP";
  if (SUPPORTED_CURRENCIES.has(upper as Currency)) return upper as Currency;
  return null;
}

/**
 * Confidence = fractie van de kern-enrichment-velden die non-null zijn.
 * Bewust niet gewogen zodat het getal reproduceerbaar is.
 */
function computeConfidence(e: EnrichedInstrument): number {
  const fields: Array<unknown> = [
    e.normalizedTicker !== e.ticker || e.sources.includes("yahoo-search")
      ? true
      : null,
    e.assetClass !== "OTHER" ? true : null,
    e.sector,
    e.industry,
    e.country,
    e.region !== "Unknown" ? true : null,
    e.currency,
    e.exchange,
  ];
  const filled = fields.filter((v) => v !== null && v !== undefined).length;
  const score = filled / fields.length;
  return Math.round(score * 100) / 100;
}
