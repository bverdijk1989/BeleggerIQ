/**
 * Behavioral coach loader — server-side.
 *
 * Verzamelt de inputs die de detectoren nodig hebben:
 *  - PortfolioView (positions, cash, sectors)
 *  - Recente transacties (last 90d)
 *  - Profile + policy
 *  - Price-history per recently-traded ticker (voor panic/FOMO-meting)
 *  - User-state per signaal (dismiss/snooze)
 *
 * **Faal-safe**: ontbrekende data → minder signalen, niet een crash.
 * History-fetch faalt niet hard; betreffende signalen worden als
 * `priceBefore=null` gemarkeerd en de detector slaat 'em over.
 */

import {
  behavioralStateRepository,
  portfolioRepository,
  transactionRepository,
  type TransactionRow,
} from "@/lib/data";
import { getHistory } from "@/lib/data/history";

import { buildPortfolioView } from "../portfolio-view";

import type {
  BehavioralDetectorInput,
  BehavioralPosition,
  BehavioralSectorExposure,
  BehavioralTransaction,
} from "./detector-types";
import { runBehavioralEngine } from "./engine";
import { applyWarningStates, partitionSignalsByStatus } from "./state";
import type {
  BehavioralReport,
  BehavioralSignalWithState,
} from "./types";

const TRANSACTION_LOOKBACK_DAYS = 90;
const PRICE_BEFORE_DAYS_SELL = 7;
const PRICE_BEFORE_DAYS_BUY = 30;
const HISTORY_LOOKBACK_DAYS = 60;

export interface LoadBehavioralCoachInput {
  userEmail: string;
  /** Override "vandaag" voor tests. */
  asOf?: Date;
}

export interface LoadBehavioralCoachResult {
  report: BehavioralReport;
  signals: BehavioralSignalWithState[];
  partitioned: ReturnType<typeof partitionSignalsByStatus>;
  noPortfolio: boolean;
  noUser: boolean;
}

export async function loadBehavioralCoach(
  input: LoadBehavioralCoachInput,
): Promise<LoadBehavioralCoachResult> {
  const ctx = await portfolioRepository
    .findUserContextByEmail(input.userEmail)
    .catch(() => null);
  if (!ctx?.userId) {
    return emptyResult({ noUser: true, noPortfolio: true });
  }
  const userId = ctx.userId;
  const portfolio = await portfolioRepository
    .findPrimaryByEmail(input.userEmail)
    .catch(() => null);
  if (!portfolio) {
    return emptyResult({ noUser: false, noPortfolio: true });
  }

  const asOf = input.asOf ?? new Date();
  const asOfIso = asOf.toISOString();

  const [view, txnRows, states] = await Promise.all([
    buildPortfolioView(portfolio, {
      includeFundamentals: true,
      includeFactorScores: true,
    }),
    transactionRepository.list({ portfolioId: portfolio.id }),
    behavioralStateRepository.listForUser(userId),
  ]);

  // Filter transacties op recency en relevant types.
  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - TRANSACTION_LOOKBACK_DAYS);
  const recentRaw = txnRows
    .filter(
      (t) =>
        t.executedAt >= cutoff &&
        (t.type === "BUY" || t.type === "SELL") &&
        t.ticker !== null,
    )
    .map((t) => t);

  // Hydrateer price-before voor panic/FOMO. We fetchen per-ticker één
  // history-call met 60d lookback; daarna pakken we per transactie de
  // close die ~7d (SELL) of ~30d (BUY) ervóór ligt.
  const tickerSet = new Set(recentRaw.map((t) => t.ticker!).filter(Boolean));
  const historyByTicker = new Map<
    string,
    Array<{ date: Date; close: number }>
  >();
  await Promise.all(
    [...tickerSet].map(async (ticker) => {
      try {
        const start = new Date(asOf);
        start.setUTCDate(
          start.getUTCDate() - HISTORY_LOOKBACK_DAYS - PRICE_BEFORE_DAYS_BUY,
        );
        const hist = await getHistory({
          ticker,
          startDate: start.toISOString().slice(0, 10),
          endDate: asOf.toISOString().slice(0, 10),
          interval: "1d",
        });
        historyByTicker.set(
          ticker,
          hist
            .filter((p) => Number.isFinite(p.close))
            .map((p) => ({ date: new Date(p.date), close: p.close })),
        );
      } catch {
        historyByTicker.set(ticker, []);
      }
    }),
  );

  const recentTransactions: BehavioralTransaction[] = recentRaw.map((row) =>
    mapTransaction(row, historyByTicker),
  );

  // Positions + sector-exposure
  const totalValue = view.summary.totalValue;
  const positions: BehavioralPosition[] = view.valuations.map((v) => {
    const weight = totalValue > 0 ? v.marketValueBase / totalValue : 0;
    const pnlPct =
      v.costBasisBase > 0 ? v.unrealizedPnlBase / v.costBasisBase : 0;
    return {
      ticker: v.holding.ticker,
      name: v.holding.name,
      sector: v.holding.sector ?? null,
      marketValueBase: v.marketValueBase,
      weight,
      pnlPct,
      assetClass: v.holding.assetClass ?? null,
    };
  });

  const sectorExposure: BehavioralSectorExposure[] = (
    view.risk.exposures.bySector ?? []
  ).map((s) => ({ label: s.label, weight: s.weight }));

  const profile = ctx.profile
    ? {
        objective: ctx.profile.objective,
        riskTolerance: ctx.profile.riskTolerance,
        investmentHorizonYrs: ctx.profile.investmentHorizonYrs,
        cashBufferPct: ctx.profile.policy?.cashBufferPct ?? null,
        maxCashShare: ctx.profile.policy?.maxCashShare ?? null,
        maxPositionWeight: ctx.profile.policy?.maxPositionWeight ?? null,
      }
    : null;

  const detectorInput: BehavioralDetectorInput = {
    portfolioId: portfolio.id,
    asOf: asOfIso,
    baseCurrency: view.summary.baseCurrency,
    totalValue,
    cashBalance: view.summary.cashBalance ?? 0,
    positionCount: view.summary.positionCount,
    positions,
    sectorExposure,
    recentTransactions,
    profile,
    portfolioVolatility: view.risk.portfolioVolatility ?? null,
  };

  const report = runBehavioralEngine(detectorInput);
  const signals = applyWarningStates(report.signals, states, asOf);
  const partitioned = partitionSignalsByStatus(signals);

  return {
    report,
    signals,
    partitioned,
    noPortfolio: false,
    noUser: false,
  };
}

// ============================================================
//  Helpers
// ============================================================

function mapTransaction(
  row: TransactionRow,
  historyByTicker: Map<string, Array<{ date: Date; close: number }>>,
): BehavioralTransaction {
  const ticker = row.ticker ?? "";
  const history = historyByTicker.get(ticker) ?? [];
  const exec = row.executedAt;
  const before7d = lookupCloseAtDaysBefore(history, exec, PRICE_BEFORE_DAYS_SELL);
  const before30d = lookupCloseAtDaysBefore(history, exec, PRICE_BEFORE_DAYS_BUY);
  return {
    id: row.id,
    type: row.type === "BUY" ? "BUY" : "SELL",
    ticker,
    executedAt: exec,
    quantity: row.quantity,
    price: row.price,
    priceBefore: before7d,
    priceBeforeDays: PRICE_BEFORE_DAYS_SELL,
    priceBefore30d: before30d,
  };
}

/**
 * Pak de history-close die het dichtst bij `executedAt - daysBefore`
 * ligt. Tolerant voor weekends/feestdagen — accepteert ±50% van het
 * window.
 */
function lookupCloseAtDaysBefore(
  history: Array<{ date: Date; close: number }>,
  executedAt: Date,
  daysBefore: number,
): number | null {
  if (history.length === 0) return null;
  const targetTs = executedAt.getTime() - daysBefore * 86_400_000;
  const tolerance = daysBefore * 0.5 * 86_400_000;
  let best: { date: Date; close: number } | null = null;
  let bestDelta = Infinity;
  for (const point of history) {
    const delta = Math.abs(point.date.getTime() - targetTs);
    if (delta < bestDelta) {
      best = point;
      bestDelta = delta;
    }
  }
  if (!best) return null;
  if (bestDelta > tolerance) return null;
  return best.close;
}

function emptyResult(opts: {
  noPortfolio: boolean;
  noUser: boolean;
}): LoadBehavioralCoachResult {
  return {
    noPortfolio: opts.noPortfolio,
    noUser: opts.noUser,
    report: {
      portfolioId: "",
      detectedAt: new Date().toISOString(),
      signals: [],
      counts: { low: 0, moderate: 0, elevated: 0, high: 0 },
      skippedDetectors: [],
    },
    signals: [],
    partitioned: { active: [], snoozed: [], dismissed: [] },
  };
}
