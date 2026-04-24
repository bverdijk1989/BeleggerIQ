import {
  buildFactorSnapshotData,
  buildPortfolioSnapshotData,
  buildPortfolioView,
  generateAllocationPlan,
  scoreFactors,
} from "@/lib/analytics";
import { computeRegimeScore } from "@/lib/analytics/regime/engine";
import {
  factorSnapshotRepository,
  portfolioSnapshotRepository,
} from "@/lib/data";
import { getFundamentals } from "@/lib/data/fundamentals";
import { getHistory } from "@/lib/data/history";
import { DEFAULT_SCREENER_UNIVERSE } from "@/lib/data/screener-universe";
import { fetchRegimeInputs } from "@/lib/data/regime";
import { log } from "@/lib/log";
import type { Portfolio } from "@/types/portfolio";

/**
 * Hooggelegen orchestrator voor snapshotting. Wordt aangeroepen door:
 *  - de on-demand API routes
 *  - een toekomstige scheduled job (bijv. Vercel Cron of GitHub Actions)
 *
 * Design:
 *  - Elke snapshot is atomair (één Prisma write per portfolio, batch voor
 *    factor snapshots).
 *  - Alle engines worden parallel gedraaid zodat de run ook bij 50+ tickers
 *    binnen de provider-cache-TTL valt.
 *  - Retourneert tellers zodat de caller iets kan loggen/teruggeven.
 */

export interface SnapshotRunResult {
  portfolioSnapshots: number;
  factorSnapshots: number;
  skippedPortfolios: number;
  skippedFactors: number;
}

export interface PortfolioSnapshotOptions {
  portfolioId: string;
  /** Optionele timestamp; default = nu. */
  at?: Date;
}

/**
 * Maakt een PortfolioSnapshot voor één portfolio. Draait de volledige
 * analytics stack (view + regime + plan) en persisteert het resultaat.
 */
export async function snapshotPortfolio(
  options: PortfolioSnapshotOptions,
): Promise<{ snapshotId: string } | null> {
  const portfolio = await findPortfolioById(options.portfolioId);
  if (!portfolio) return null;

  const [view, regimeFetch] = await Promise.all([
    buildPortfolioView(portfolio, {
      includeFundamentals: true,
      includeFactorScores: true,
    }),
    fetchRegimeInputs(),
  ]);
  const regime = regimeFetch
    ? computeRegimeScore(regimeFetch.input, {
        asOf: regimeFetch.asOf,
        source: regimeFetch.source,
      })
    : null;

  const plan = generateAllocationPlan({
    portfolioId: portfolio.id,
    baseCurrency: view.summary.baseCurrency,
    valuations: view.valuations,
    totalValue: view.summary.totalValue,
    cashBalance: view.summary.cashBalance,
    monthlyContribution: 0,
    regime,
  });

  const data = buildPortfolioSnapshotData({
    view,
    regime,
    plan,
    capturedAt: options.at,
  });
  const row = await portfolioSnapshotRepository.create(data);
  return { snapshotId: row.id };
}

async function findPortfolioById(id: string): Promise<Portfolio | null> {
  const { prisma } = await import("@/lib/data/prisma");
  const row = await prisma.portfolio.findUnique({
    where: { id },
    include: { holdings: true },
  });
  if (!row) return null;
  // Minimal mapping — velden die de analytics engines nodig hebben.
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    baseCurrency: row.baseCurrency as Portfolio["baseCurrency"],
    isPrimary: row.isPrimary,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    holdings: row.holdings.map((h) => ({
      id: h.id,
      portfolioId: h.portfolioId,
      ticker: h.ticker,
      isin: h.isin,
      name: h.name,
      assetClass: h.assetClass as Portfolio["holdings"][number]["assetClass"],
      currency: h.currency as Portfolio["holdings"][number]["currency"],
      quantity: Number(h.quantity),
      avgCostPrice: Number(h.avgCostPrice),
      currentPrice: h.currentPrice !== null ? Number(h.currentPrice) : null,
      sector: h.sector,
      region: h.region,
      beta: h.beta !== null ? Number(h.beta) : undefined,
      volatility: h.volatility !== null ? Number(h.volatility) : undefined,
      moatLikeScore:
        h.moatLikeScore !== null ? Number(h.moatLikeScore) : undefined,
      targetWeight:
        h.targetWeight !== null ? Number(h.targetWeight) : undefined,
      convictionScore:
        h.convictionScore !== null ? Number(h.convictionScore) : undefined,
      metadata:
        h.metadata as Portfolio["holdings"][number]["metadata"],
    })),
  };
}

// ============================================================
//  Factor snapshotting
// ============================================================

export interface FactorSnapshotOptions {
  /** Welke tickers te scoren. Default: screener universe. */
  tickers?: string[];
  /** Optionele timestamp; default = nu. */
  at?: Date;
  /** Model-tag voor herbruikbaarheid. Default: "beleggeriq.v1". */
  model?: string;
}

/**
 * Score een set tickers en persisteer FactorSnapshot rows. Idempotent op
 * (ticker, capturedAt, model). Geschikt voor maandelijkse scheduled runs.
 */
export async function snapshotFactors(
  options: FactorSnapshotOptions = {},
): Promise<{ written: number; skipped: number }> {
  const tickers =
    options.tickers ?? DEFAULT_SCREENER_UNIVERSE.map((entry) => entry.ticker);
  const at = options.at ?? new Date();
  const model = options.model ?? "beleggeriq.v1";

  const startDate = new Date(at);
  startDate.setDate(startDate.getDate() - 400);

  const results = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const [fundamentals, history] = await Promise.all([
          getFundamentals(ticker),
          getHistory({
            ticker,
            startDate: startDate.toISOString().slice(0, 10),
            endDate: at.toISOString().slice(0, 10),
            interval: "1d",
          }),
        ]);
        if (!fundamentals) return null;
        const factorScore = scoreFactors({
          ticker,
          asOf: at.toISOString(),
          fundamentals,
          priceHistory: history,
        });
        return buildFactorSnapshotData({
          ticker,
          factorScore,
          fundamentals,
          source: "beleggeriq.engine",
          capturedAt: at,
        });
      } catch (error) {
        log.warn("snapshot:factor", "scoring failed", { ticker, error });
        return null;
      }
    }),
  );

  const rows = results.filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null,
  );
  const written = await factorSnapshotRepository.upsertMany(rows);
  return { written, skipped: tickers.length - written };
}

// ============================================================
//  Scheduled bundle
// ============================================================

/**
 * Draait portfolio + factor snapshots in één batch. Wordt aangeroepen door
 * een eventuele cron-handler; voor nu een directe helper die ook handmatig
 * gebruikt kan worden via de API routes.
 */
export async function runScheduledSnapshots(params: {
  userEmail: string;
  at?: Date;
}): Promise<SnapshotRunResult> {
  const { prisma } = await import("@/lib/data/prisma");
  const user = await prisma.user.findUnique({
    where: { email: params.userEmail },
    include: {
      portfolios: { select: { id: true } },
    },
  });

  if (!user) {
    return {
      portfolioSnapshots: 0,
      factorSnapshots: 0,
      skippedPortfolios: 0,
      skippedFactors: 0,
    };
  }

  const portfolioResults = await Promise.all(
    user.portfolios.map((p) => snapshotPortfolio({ portfolioId: p.id, at: params.at })),
  );
  const successCount = portfolioResults.filter((r) => r !== null).length;

  const factorResult = await snapshotFactors({ at: params.at });

  return {
    portfolioSnapshots: successCount,
    factorSnapshots: factorResult.written,
    skippedPortfolios: user.portfolios.length - successCount,
    skippedFactors: factorResult.skipped,
  };
}
