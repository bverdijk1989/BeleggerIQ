import {
  huntingListRepository,
  portfolioRepository,
  prisma,
} from "@/lib/data";
import { getFundamentals } from "@/lib/data/fundamentals";
import { getQuotes } from "@/lib/data/quotes";
import { scoreFactors } from "@/lib/analytics/factors/composite";
import {
  bucketHoldingToAssetClass,
  loadMacroRegimeReport,
} from "@/lib/analytics/macro-regime";
import { buildPortfolioView } from "@/lib/analytics/portfolio-view";
import {
  asUniverseEntry,
  buildWatchlistIntelligenceReport,
  type SimilarUniverseEntry,
  type WatchlistIntelligenceReport,
} from "@/lib/watchlist-intelligence";
import type { FactorScore, FundamentalsSnapshot } from "@/types/factor";
import type { Quote } from "@/types/market";
import type { WatchlistItem } from "@/types/watchlist";

/**
 * Loader voor de /watchlist-pagina.
 *
 * Hydrateert per item:
 *  - quote (live prijs)
 *  - factor-snapshot (huidig + ~30d eerder voor delta-detectie)
 *  - fundamentals (graceful naar null bij feed-fouten)
 *  - intelligence-report (Module 11) met 7 signalen + alternatives
 *
 * Universe voor alternatives: union van portfolio-holdings + andere
 * watchlist-items, beperkt tot tickers met composite-score.
 */

export interface FactorSummary {
  composite: number | null;
  percentile: number | null;
  asOf: string;
}

export interface EnrichedWatchlistRow {
  item: WatchlistItem;
  quote: Quote | null;
  factor: FactorSummary | null;
  /** Korte deterministische rationale — legacy table-cell. */
  rationale: string | null;
  /** Volledig intelligence-report (Module 11) met 7 signalen. */
  intelligence: WatchlistIntelligenceReport | null;
}

interface FactorPair {
  current: FactorScore | null;
  previous: FactorScore | null;
}

const PREVIOUS_LOOKBACK_DAYS = 30;

async function loadFactorPairsByTicker(
  tickers: string[],
): Promise<Map<string, FactorPair>> {
  if (tickers.length === 0) return new Map();
  const rows = await prisma.factorSnapshot.findMany({
    where: { ticker: { in: tickers } },
    orderBy: { capturedAt: "desc" },
  });
  const out = new Map<string, FactorPair>();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - PREVIOUS_LOOKBACK_DAYS);

  for (const row of rows) {
    const existing = out.get(row.ticker) ?? { current: null, previous: null };
    const score: FactorScore = {
      ticker: row.ticker,
      asOf: row.capturedAt.toISOString(),
      composite: row.composite !== null ? Number(row.composite) * 100 : 50,
      confidence: row.confidence !== null ? Number(row.confidence) : 0.5,
      subScores: {
        value: row.valueScore !== null ? Number(row.valueScore) * 100 : 50,
        quality: row.qualityScore !== null ? Number(row.qualityScore) * 100 : 50,
        momentum:
          row.momentumScore !== null ? Number(row.momentumScore) * 100 : 50,
        lowVol: row.lowVolScore !== null ? Number(row.lowVolScore) * 100 : 50,
      },
    };
    if (existing.current === null) {
      existing.current = score;
    } else if (existing.previous === null && row.capturedAt < cutoff) {
      existing.previous = score;
    }
    out.set(row.ticker, existing);
  }
  return out;
}

function buildLegacyRationale(input: {
  item: WatchlistItem;
  quote: Quote | null;
  factor: FactorSummary | null;
}): string | null {
  const bits: string[] = [];
  if (
    input.quote &&
    input.item.targetPrice !== null &&
    input.item.targetPrice !== undefined
  ) {
    const tolerance = input.item.buyZoneTolerance ?? 0.05;
    const lower = input.item.targetPrice;
    const upper = input.item.targetPriceHigh ?? lower * (1 + tolerance);
    if (input.quote.price <= upper && input.quote.price >= lower) {
      bits.push(
        `Prijs ${input.quote.price.toFixed(2)} ${input.quote.currency} valt binnen je koop-zone (${lower.toFixed(2)}–${upper.toFixed(2)}).`,
      );
    } else if (input.quote.price < lower) {
      bits.push(
        `Prijs ${input.quote.price.toFixed(2)} ligt onder je koop-zone — onderzoek of de daling fundamenteel is.`,
      );
    } else {
      const distancePct = ((input.quote.price - upper) / upper) * 100;
      bits.push(
        `Prijs zit ${distancePct.toFixed(1)}% boven je koop-zone — wachten tot 'em terugkomt.`,
      );
    }
  }
  if (input.factor && input.factor.composite !== null) {
    const score = input.factor.composite;
    if (score >= 0.75) {
      bits.push(`Composite ${(score * 100).toFixed(0)}/100 — sterk profiel.`);
    } else if (score <= 0.4) {
      bits.push(
        `Composite ${(score * 100).toFixed(0)}/100 — fundamentals zijn matig; wees kritisch.`,
      );
    }
  }
  return bits.length > 0 ? bits.join(" ") : null;
}

export async function loadEnrichedWatchlist(
  email: string,
): Promise<EnrichedWatchlistRow[]> {
  const items = await huntingListRepository.listItemsByEmail(email);
  if (items.length === 0) return [];

  const tickers = Array.from(new Set(items.map((i) => i.ticker)));

  // Portfolio-view voor universe + sector/asset-class lookup.
  const portfolio = await portfolioRepository
    .findPrimaryByEmail(email)
    .catch(() => null);

  const [quotes, factorPairs, view, macro] = await Promise.all([
    getQuotes(tickers).catch(() => [] as Quote[]),
    loadFactorPairsByTicker(tickers),
    portfolio
      ? buildPortfolioView(portfolio, {
          includeFundamentals: true,
          includeFactorScores: true,
        }).catch(() => null)
      : Promise.resolve(null),
    loadMacroRegimeReport({ view: null }).catch(() => null),
  ]);

  // Universe voor alternatives.
  const universe: SimilarUniverseEntry[] = [];
  if (view) {
    for (const v of view.valuations) {
      const composite = v.holding.factorScore?.composite;
      if (typeof composite !== "number") continue;
      const entry = asUniverseEntry(
        v.holding.ticker,
        v.holding.name,
        v.holding.sector ?? null,
        composite,
        "portfolio",
      );
      if (entry) universe.push(entry);
    }
  }
  for (const ticker of tickers) {
    if (universe.some((u) => u.ticker === ticker)) continue;
    const fp = factorPairs.get(ticker);
    if (!fp?.current?.composite) continue;
    const item = items.find((i) => i.ticker === ticker);
    const entry = asUniverseEntry(
      ticker,
      item?.name ?? ticker,
      null,
      fp.current.composite,
      "watchlist",
    );
    if (entry) universe.push(entry);
  }

  // Fundamentals per ticker (parallel + graceful).
  const fundamentalsByTicker = new Map<string, FundamentalsSnapshot | null>();
  await Promise.all(
    tickers.map(async (t) => {
      const f = await getFundamentals(t).catch(() => null);
      fundamentalsByTicker.set(t, f);
    }),
  );

  const quoteByTicker = new Map<string, Quote>();
  for (const q of quotes) quoteByTicker.set(q.ticker, q);

  const asOfIso = new Date().toISOString();

  return items
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
    .map((item) => {
      const quote = quoteByTicker.get(item.ticker) ?? null;
      const fp = factorPairs.get(item.ticker) ?? {
        current: null,
        previous: null,
      };
      const fundamentals = fundamentalsByTicker.get(item.ticker) ?? null;

      const portfolioHolding = view?.valuations.find(
        (v) => v.holding.ticker === item.ticker,
      );
      const sector = portfolioHolding?.holding.sector ?? null;
      const assetClassKey = portfolioHolding
        ? bucketHoldingToAssetClass(portfolioHolding.holding)
        : null;

      // Bouw factor-score uit fundamentals indien geen snapshot beschikbaar.
      let factorScore: FactorScore | null = fp.current;
      if (!factorScore && fundamentals) {
        factorScore = scoreFactors({
          ticker: item.ticker,
          asOf: asOfIso,
          fundamentals,
          priceHistory: [],
        });
      }

      // Legacy summary (composite als fractie, niet 0..100).
      const factor: FactorSummary | null = factorScore
        ? {
            composite: factorScore.composite / 100,
            percentile: factorScore.percentile ?? null,
            asOf: factorScore.asOf,
          }
        : null;

      const intelligence = buildWatchlistIntelligenceReport({
        asOf: asOfIso,
        macro,
        universe,
        current: {
          ticker: item.ticker,
          name: item.name ?? item.ticker,
          sector,
          assetClassKey,
          factorScore,
          previousFactorScore: fp.previous,
          fundamentals,
          previousFundamentals: null,
          nextEarningsDate: null,
          sentimentScore: null,
          sentimentDelta: null,
        },
      });

      return {
        item,
        quote,
        factor,
        rationale: buildLegacyRationale({ item, quote, factor }),
        intelligence,
      };
    });
}
