import { classifyInstrument, runScreen } from "@/lib/analytics";
import { computeRegimeScore } from "@/lib/analytics/regime/engine";
import { scanOpportunities } from "@/lib/analytics/opportunity-radar";
import type { PortfolioView } from "@/lib/analytics/portfolio-view";
import { getHistory } from "@/lib/data/history";
import { getQuotes } from "@/lib/data/quotes";
import { fetchRegimeInputs } from "@/lib/data/regime";
import { prisma } from "@/lib/data/prisma";
import type { OpportunityReport } from "@/lib/analytics/opportunity-radar";
import type { HistoricalPoint } from "@/types/market";
import type { Holding, Portfolio } from "@/types/portfolio";
import type { WatchlistItem } from "@/types/watchlist";

/**
 * Server-only data-loader voor de Opportunity Radar.
 *
 * Verzamelt drie bronnen:
 *   - Portfolio-holdings (uit `buildPortfolioView`, via caller doorgegeven).
 *   - Screener-universum (top-30 factor-kandidaten via `runScreen`).
 *   - Watchlist-items (uit Prisma, met live quotes).
 *
 * Daarna roept het `scanOpportunities` aan met:
 *   - huidige market regime score
 *   - price history per holding (gebruikt door detectoren 1, 3, 7)
 *   - targetWeight per holding (afgeleid uit policy + classifier)
 *
 * Volledig pure businesslogica aan de engine-kant; deze loader doet
 * alleen I/O en aggregatie.
 */

export interface LoadOpportunityDataInput {
  portfolio: Portfolio;
  /** Pre-computed view — gebruikt voor valuations + factor scores. */
  view: PortfolioView;
  userEmail: string;
  config?: {
    minSignalStrength?: number;
    maxCandidates?: number;
    screenerLimit?: number;
  };
}

export interface LoadOpportunityDataResult {
  report: OpportunityReport;
  /** Asset-class map voor UI-weergave. */
  assetClassByTicker: Map<string, Holding["assetClass"]>;
}

export async function loadOpportunityData(
  input: LoadOpportunityDataInput,
): Promise<LoadOpportunityDataResult> {
  const { portfolio, view } = input;
  const config = input.config ?? {};

  // --- Regime ---
  const regimeFetch = await fetchRegimeInputs().catch(() => null);
  const regime = regimeFetch
    ? computeRegimeScore(regimeFetch.input, {
        asOf: regimeFetch.asOf,
        source: regimeFetch.source,
      })
    : null;

  // --- Portfolio price histories ---
  // Geen onderdeel van PortfolioView — fetchen we parallel per holding.
  // Cache dedupliceert zodat herhaalde tickers (ook in de screener) geen
  // extra hit op de provider zijn.
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 400);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);

  const portfolioHistoryEntries = await Promise.all(
    portfolio.holdings.map(async (h) => {
      const history = await getHistory({
        ticker: h.ticker,
        startDate: startIso,
        endDate: endIso,
        interval: "1d",
      }).catch(() => [] as HistoricalPoint[]);
      return [h.ticker, history] as const;
    }),
  );
  const portfolioHistoryByTicker = new Map(portfolioHistoryEntries);

  // --- Portfolio input voor radar ---
  const totalValue = view.summary.totalValue;
  // Uniforme target-weight: default = 1 / n posities zodat underweight-
  // conviction en ETF-core-rebalance iets hebben om tegen af te zetten.
  const defaultTarget =
    portfolio.holdings.length > 0 ? 1 / portfolio.holdings.length : 0;

  const portfolioInput = portfolio.holdings.map((h) => {
    const valuation = view.valuations.find((v) => v.holding.id === h.id);
    const weight =
      totalValue > 0 && valuation
        ? valuation.marketValueBase / totalValue
        : 0;
    const priceHistory = portfolioHistoryByTicker.get(h.ticker) ?? [];
    const factorScore =
      view.factorScores.get(h.ticker) ?? h.factorScore ?? null;

    // Snelle classificatie om te weten of 'ie een broad-market ETF is —
    // enrichment zit al op de Holding als we die eerder hebben geladen,
    // anders leunen we op de pure classifier met wat we hebben.
    const classification = classifyInstrument({
      holding: h,
      enrichment: null,
    });

    return {
      ticker: h.ticker,
      name: h.name,
      isin: h.isin ?? null,
      currentWeight: weight,
      targetWeight: defaultTarget,
      factorScore,
      priceHistory,
      quote: valuation
        ? {
            ticker: h.ticker,
            price: valuation.unitPrice,
            currency: h.currency,
            asOf: valuation.asOf,
          }
        : null,
      isBroadMarketEtf: classification.instrumentType === "BROAD_MARKET_ETF",
    };
  });

  // --- Screener input voor radar ---
  const screenerResult = await runScreen({
    filters: {},
    limit: config.screenerLimit ?? 40,
  }).catch(() => null);

  const screenerTickers =
    screenerResult?.candidates.map((c) => c.ticker) ?? [];

  // Price history voor screener-candidates — nodig voor detectoren 1/3/7.
  // Parallel fetchen (cache dedupliceert).
  const screenerHistories = await Promise.all(
    screenerTickers.map(async (ticker) => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 400);
      const history = await getHistory({
        ticker,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        interval: "1d",
      }).catch(() => [] as HistoricalPoint[]);
      return [ticker, history] as const;
    }),
  );
  const historyMap = new Map(screenerHistories);
  const screenerQuotes = await getQuotes(screenerTickers).catch(() => []);
  const quoteByTicker = new Map(screenerQuotes.map((q) => [q.ticker, q]));

  const screenerInput = (screenerResult?.candidates ?? [])
    // Skip tickers die al in de portefeuille zitten — anders dubbel werk.
    .filter(
      (c) => !portfolio.holdings.some((h) => h.ticker === c.ticker),
    )
    .map((c) => ({
      ticker: c.ticker,
      name: c.name,
      isin: null,
      factorScore: c.factorScore,
      priceHistory: historyMap.get(c.ticker) ?? [],
      quote: quoteByTicker.get(c.ticker) ?? null,
    }));

  // --- Watchlist input ---
  const user = await prisma.user
    .findUnique({
      where: { email: input.userEmail },
      select: { id: true },
    })
    .catch(() => null);
  const watchlistItems: WatchlistItem[] = user
    ? await prisma.watchlistItem
        .findMany({ where: { userId: user.id } })
        .then((rows) =>
          rows.map((r) => ({
            id: r.id,
            userId: r.userId,
            ticker: r.ticker,
            name: r.name ?? null,
            note: r.note ?? null,
            targetPrice:
              r.targetPrice !== null && r.targetPrice !== undefined
                ? Number(r.targetPrice)
                : null,
            addedAt: r.addedAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          })),
        )
        .catch(() => [] as WatchlistItem[])
    : [];
  const watchlistTickers = watchlistItems.map((w) => w.ticker);
  const watchlistQuotes = await getQuotes(watchlistTickers).catch(() => []);
  const watchlistQuoteMap = new Map(watchlistQuotes.map((q) => [q.ticker, q]));

  const watchlistInput = watchlistItems.map((item) => ({
    item,
    quote: watchlistQuoteMap.get(item.ticker) ?? null,
  }));

  // --- Scan ---
  const report = scanOpportunities({
    portfolio: portfolioInput,
    screener: screenerInput,
    watchlist: watchlistInput,
    regime,
    config: {
      minSignalStrength: config.minSignalStrength,
      maxCandidates: config.maxCandidates,
    },
  });

  // Asset-class map voor UI-labels.
  const assetClassByTicker = new Map(
    portfolio.holdings.map((h) => [h.ticker, h.assetClass]),
  );

  return { report, assetClassByTicker };
}
