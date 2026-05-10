/**
 * Context-aggregator: bouwt `BriefingContext` uit reeds berekende
 * dashboard-data. Pure functie — geen Prisma, geen netwerk.
 *
 * Snapshot-strategie:
 *  - Snapshots zijn typisch newest-first (uit `listForPortfolio`); we
 *    sorteren expliciet op `capturedAt` ascending zodat day/week/month-
 *    deltas onafhankelijk van DB-volgorde correct zijn.
 *  - Day-change = laatste vs één-na-laatste snapshot.
 *  - Week-change = laatste vs snapshot ~7 dagen ouder (closest).
 *  - Month-change = laatste vs snapshot ~30 dagen ouder (closest).
 */

import type {
  DashboardAction,
  DashboardRiskAction,
} from "@/lib/analytics";
import type { PortfolioView } from "@/lib/analytics/portfolio-view";
import type { PortfolioSnapshotRow } from "@/lib/data/snapshot-repository";
import type { MarketRegimeScore } from "@/types/regime";

import type {
  BriefingContext,
  BriefingPositionSnapshot,
  BriefingRiskSnapshot,
} from "./types";

const TOP_WINNERS_LOSERS = 3;
const TOP_RISKS = 3;

export interface BuildBriefingContextInput {
  portfolioId: string;
  briefingDate: string;
  view: PortfolioView;
  snapshots: PortfolioSnapshotRow[];
  regime: MarketRegimeScore | null;
  dashboardActions: DashboardAction[];
  riskActions: DashboardRiskAction[];
}

export function buildBriefingContext(
  input: BuildBriefingContextInput,
): BriefingContext {
  const { view, snapshots, regime, dashboardActions, riskActions } = input;

  const totalValue = view.summary.totalValue;
  const cashShare =
    totalValue > 0 ? (view.summary.cashBalance ?? 0) / totalValue : 0;

  const movement = computeMovement(snapshots, view.summary.unrealizedPnlPct ?? null);
  const winnersLosers = computeWinnersLosers(view, totalValue);
  const risks = mapRisks(riskActions);
  const concentration = computeConcentration(view);
  const focusAction = mapFocusAction(dashboardActions);

  const factorScored = view.valuations.filter(
    (v) => v.holding.factorScore != null,
  ).length;

  return {
    portfolioId: input.portfolioId,
    briefingDate: input.briefingDate,
    baseCurrency: view.summary.baseCurrency,
    totals: {
      totalValue,
      cashBalance: view.summary.cashBalance ?? 0,
      cashShare,
      positionCount: view.summary.positionCount,
    },
    movement,
    winnersLosers,
    risks,
    macro: regime
      ? {
          stance: regime.stance,
          score: regime.score,
          confidence: regime.confidence ?? 0.5,
          narrative: regime.narrative ?? "",
        }
      : null,
    concentration,
    focusAction,
    earningsNews: { available: false, items: [] },
    dataSources: {
      snapshots: snapshots.length,
      factorScored,
      regimeAvailable: regime !== null,
      riskActionsAvailable: riskActions.length,
    },
  };
}

// ============================================================
//  Bewegingen uit snapshots
// ============================================================

function computeMovement(
  snapshots: PortfolioSnapshotRow[],
  fallbackSincePurchasePct: number | null,
): BriefingContext["movement"] {
  if (snapshots.length < 2) {
    return {
      dayChangePct: null,
      weekChangePct: null,
      monthChangePct: null,
      sincePurchasePct: fallbackSincePurchasePct,
    };
  }
  const sorted = [...snapshots].sort(
    (a, b) =>
      new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );
  const latest = sorted[sorted.length - 1]!;
  const previous = sorted[sorted.length - 2]!;
  const latestValue = latest.totalValue;

  const dayChangePct = computePctChange(previous.totalValue, latestValue);
  const weekChangePct = computeChangeNDaysAgo(sorted, 7, latestValue);
  const monthChangePct = computeChangeNDaysAgo(sorted, 30, latestValue);

  return {
    dayChangePct,
    weekChangePct,
    monthChangePct,
    sincePurchasePct:
      typeof latest.unrealizedPnlPct === "number"
        ? latest.unrealizedPnlPct
        : fallbackSincePurchasePct,
  };
}

/**
 * Pak de snapshot die het dichtst bij `daysAgo` ligt — niet exact, want
 * snapshots draaien niet altijd elke dag.
 */
function computeChangeNDaysAgo(
  sorted: PortfolioSnapshotRow[],
  daysAgo: number,
  latestValue: number,
): number | null {
  if (sorted.length === 0) return null;
  const latestTs = new Date(sorted[sorted.length - 1]!.capturedAt).getTime();
  const targetTs = latestTs - daysAgo * 86_400_000;
  let best: PortfolioSnapshotRow | null = null;
  let bestDelta = Infinity;
  for (const snap of sorted) {
    const delta = Math.abs(new Date(snap.capturedAt).getTime() - targetTs);
    if (delta < bestDelta) {
      best = snap;
      bestDelta = delta;
    }
  }
  if (!best) return null;
  // Alleen pakken als de snapshot binnen ±25% van het target-window valt
  // (anders verzin je een week-change uit een 2-dagen-oude snapshot).
  const acceptableDelta = daysAgo * 0.5 * 86_400_000;
  if (bestDelta > acceptableDelta) return null;
  return computePctChange(best.totalValue, latestValue);
}

function computePctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return null;
  return (to - from) / from;
}

// ============================================================
//  Winners / losers
// ============================================================

function computeWinnersLosers(
  view: PortfolioView,
  totalValue: number,
): BriefingContext["winnersLosers"] {
  const candidates: BriefingPositionSnapshot[] = view.valuations
    .filter((v) => Number.isFinite(v.unrealizedPnlBase) && v.costBasisBase > 0)
    .map((v) => ({
      ticker: v.holding.ticker,
      name: v.holding.name,
      pnlPct: v.unrealizedPnlBase / v.costBasisBase,
      marketValueBase: v.marketValueBase,
      weight: totalValue > 0 ? v.marketValueBase / totalValue : 0,
    }));

  const winners = [...candidates]
    .sort((a, b) => b.pnlPct - a.pnlPct)
    .slice(0, TOP_WINNERS_LOSERS)
    .filter((p) => p.pnlPct > 0);
  const losers = [...candidates]
    .sort((a, b) => a.pnlPct - b.pnlPct)
    .slice(0, TOP_WINNERS_LOSERS)
    .filter((p) => p.pnlPct < 0);

  return { winners, losers };
}

// ============================================================
//  Risks
// ============================================================

function mapRisks(riskActions: DashboardRiskAction[]): BriefingRiskSnapshot[] {
  return riskActions.slice(0, TOP_RISKS).map((r) => ({
    title: r.title,
    severity: r.severity,
    impact: r.impact,
    recommendedAction: r.recommendedAction,
    confidence: r.confidence,
  }));
}

// ============================================================
//  Concentratie
// ============================================================

function computeConcentration(
  view: PortfolioView,
): BriefingContext["concentration"] {
  const sorted = [...view.valuations].sort(
    (a, b) => b.marketValueBase - a.marketValueBase,
  );
  const total = view.summary.totalValue;
  const largest = sorted[0];
  const largestWeight =
    largest && total > 0 ? largest.marketValueBase / total : 0;

  const sectors = view.risk.exposures.bySector ?? [];
  const sortedSectors = [...sectors].sort((a, b) => b.weight - a.weight);
  const topSector = sortedSectors[0] ?? null;

  return {
    largestPositionTicker: largest?.holding.ticker ?? null,
    largestPositionWeight: largestWeight,
    largestSectorLabel: topSector?.label ?? null,
    largestSectorWeight: topSector?.weight ?? null,
    portfolioVolatility: view.risk.portfolioVolatility ?? null,
    maxDrawdown: view.risk.maxDrawdown ?? null,
  };
}

// ============================================================
//  Focus-actie
// ============================================================

function mapFocusAction(
  dashboardActions: DashboardAction[],
): BriefingContext["focusAction"] {
  const top = dashboardActions[0];
  if (!top) return null;
  return {
    title: top.title,
    description: top.description,
    confidence: top.confidence,
    sourceEngine: top.sourceEngine,
  };
}
