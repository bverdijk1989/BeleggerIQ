/**
 * Loader: hydrateert de Portfolio Health Score input-shape uit de
 * bestaande analytics-output (PortfolioView + regime + snapshots +
 * fundamentals). Server-only — gebruikt geen Prisma direct, maar leest
 * wel ge-aggregeerde data die de caller al heeft opgehaald.
 *
 * **Geen extra I/O**: alle input is reeds berekend op het dashboard.
 * Deze module mapt alleen velden naar de scoring-input — pure functie,
 * deterministisch, snel.
 */

import type { FundamentalsSnapshot } from "@/types/factor";
import type { MarketRegimeScore } from "@/types/regime";
import type { PolicySettings, UserProfile } from "@/types/profile";

import type { PortfolioView } from "../portfolio-view";
import type { PortfolioSnapshotRow } from "@/lib/data/snapshot-repository";

import { computePortfolioHealthScore } from "./engine";
import type { PortfolioHealthInput } from "./loader-types";
import type {
  CashBufferInput,
  DiversificationInput,
  DividendQualityInput,
  DrawdownInput,
  FundamentalQualityInput,
  GeographicInput,
  MacroSensitivityInput,
  SectorConcentrationInput,
  ValuationRiskInput,
  VolatilityInput,
} from "./scorers";
import type { PortfolioHealthScore } from "./types";

const CYCLICAL_SECTOR_KEYWORDS = [
  "consumer discretionary",
  "industrial",
  "industrials",
  "energy",
  "materials",
  "financial",
  "financials",
  "technology",
  "communication",
];

const DEFAULT_CASH_TARGET = 0.05;

export interface BuildHealthScoreInput {
  view: PortfolioView;
  regime: MarketRegimeScore | null;
  snapshots: PortfolioSnapshotRow[];
  /** Fundamentals — als beschikbaar voor dividend-yield. Optioneel. */
  fundamentals?: Map<string, FundamentalsSnapshot> | null;
  profile?: UserProfile | null;
  policy?: PolicySettings | null;
}

/**
 * Hoofd-loader. Combineert de losse data-bronnen in één
 * `PortfolioHealthInput` en draait er meteen `computePortfolioHealthScore`
 * over heen — zo blijft de page-level call minimaal.
 */
export function loadPortfolioHealthScore(
  input: BuildHealthScoreInput,
): PortfolioHealthScore {
  const ready: PortfolioHealthInput = {
    portfolioId: input.view.summary.portfolioId,
    asOf: input.view.lastUpdated,
    diversification: buildDiversification(input.view),
    sector: buildSector(input.view),
    geographic: buildGeographic(input.view),
    volatility: buildVolatility(input.view, input.snapshots),
    drawdown: buildDrawdown(input.snapshots),
    cashBuffer: buildCashBuffer(input.view, input.regime, input.policy),
    dividend: buildDividend(input.view, input.fundamentals, input.profile),
    fundamental: buildFundamental(input.view),
    valuation: buildValuation(input.view),
    macro: buildMacro(input.view, input.regime),
  };
  return computePortfolioHealthScore(ready);
}

// ============================================================
//  Per-component builders
// ============================================================

function buildDiversification(view: PortfolioView): DiversificationInput {
  const positionCount = view.summary.positionCount;
  const hhi = view.risk.concentrationHhi ?? 0;
  // top5: gebruik bestaande veld of bereken uit risk-positions
  let top5Weight = view.risk.top5Weight ?? 0;
  if (top5Weight === 0 && view.risk.positions.length > 0) {
    const sorted = [...view.risk.positions]
      .sort((a, b) => b.concentrationWeight - a.concentrationWeight)
      .slice(0, 5);
    top5Weight = sorted.reduce((sum, p) => sum + p.concentrationWeight, 0);
  }
  return { positionCount, hhi, top5Weight };
}

function buildSector(view: PortfolioView): SectorConcentrationInput {
  const sectors = view.risk.exposures.bySector ?? [];
  if (sectors.length === 0) {
    return { sectorHhi: null, largestSectorWeight: null, sectorCoverage: 0 };
  }
  const weights = sectors.map((s) => s.weight);
  const sumWeights = weights.reduce((sum, w) => sum + w, 0);
  // Coverage = som van bekende sector-weights; restant zit in "Onbekend"
  const knownShare = sectors
    .filter((s) => s.label.toLowerCase() !== "onbekend" && s.label.toLowerCase() !== "unknown")
    .reduce((sum, s) => sum + s.weight, 0);
  const sectorHhi = weights.reduce((sum, w) => sum + (w / Math.max(sumWeights, 1e-9)) ** 2, 0);
  const largestSectorWeight = Math.max(...weights, 0);
  return {
    sectorHhi,
    largestSectorWeight,
    sectorCoverage: clamp01(knownShare),
  };
}

function buildGeographic(view: PortfolioView): GeographicInput {
  const regions = view.risk.exposures.byRegion ?? [];
  if (regions.length === 0) {
    return { regionHhi: null, largestRegionWeight: null, regionCoverage: 0 };
  }
  const weights = regions.map((r) => r.weight);
  const sumWeights = weights.reduce((sum, w) => sum + w, 0);
  const knownShare = regions
    .filter((r) => r.label.toLowerCase() !== "onbekend" && r.label.toLowerCase() !== "unknown")
    .reduce((sum, r) => sum + r.weight, 0);
  const regionHhi = weights.reduce(
    (sum, w) => sum + (w / Math.max(sumWeights, 1e-9)) ** 2,
    0,
  );
  return {
    regionHhi,
    largestRegionWeight: Math.max(...weights, 0),
    regionCoverage: clamp01(knownShare),
  };
}

function buildVolatility(
  view: PortfolioView,
  snapshots: PortfolioSnapshotRow[],
): VolatilityInput {
  // Geprefereerd: portfolioVolatility uit risk-engine (uit price history).
  // Fallback: de volatility-veld op snapshots indien aanwezig.
  const fromRisk = view.risk.portfolioVolatility;
  if (typeof fromRisk === "number" && Number.isFinite(fromRisk)) {
    // Risk-engine gebruikt typisch ~90 punten history; veiligere defaults.
    return { annualizedVolatility: fromRisk, sampleSize: 90 };
  }
  const recent = snapshots
    .filter((s) => s.volatility !== null && Number.isFinite(s.volatility))
    .slice(0, 1);
  if (recent.length > 0 && recent[0]!.volatility !== null) {
    return {
      annualizedVolatility: recent[0]!.volatility,
      sampleSize: snapshots.length,
    };
  }
  return { annualizedVolatility: null, sampleSize: snapshots.length };
}

/**
 * Bereken peak-to-trough max drawdown uit snapshot-totalValue serie.
 * Snapshots zijn typisch oldest-first of newest-first; we sorteren expliciet
 * op `capturedAt` ascending om te voorkomen dat de peak-tracking faalt.
 */
function buildDrawdown(snapshots: PortfolioSnapshotRow[]): DrawdownInput {
  if (snapshots.length < 20) {
    return { maxDrawdown: null, sampleSize: snapshots.length };
  }
  const sorted = [...snapshots].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
  );
  let peak = 0;
  let maxDd = 0;
  for (const snap of sorted) {
    if (!Number.isFinite(snap.totalValue) || snap.totalValue <= 0) continue;
    if (snap.totalValue > peak) peak = snap.totalValue;
    if (peak > 0) {
      const dd = (peak - snap.totalValue) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return { maxDrawdown: maxDd, sampleSize: sorted.length };
}

function buildCashBuffer(
  view: PortfolioView,
  regime: MarketRegimeScore | null,
  policy: PolicySettings | null | undefined,
): CashBufferInput {
  const totalValue = view.summary.totalValue;
  const cash = view.summary.cashBalance ?? 0;
  const cashShare = totalValue > 0 ? cash / totalValue : 0;
  const targetCashShare = policy?.cashBufferPct ?? DEFAULT_CASH_TARGET;
  return {
    cashShare,
    targetCashShare,
    isDefensiveRegime: regime?.stance === "DEFENSIVE",
  };
}

function buildDividend(
  view: PortfolioView,
  fundamentals: Map<string, FundamentalsSnapshot> | null | undefined,
  profile: UserProfile | null | undefined,
): DividendQualityInput {
  const isIncomeObjective = profile?.objective === "INCOME";
  if (!fundamentals || fundamentals.size === 0) {
    return {
      weightedYield: null,
      positionsWithDividends: 0,
      totalPositions: view.summary.positionCount,
      isIncomeObjective,
    };
  }
  let weightedYield = 0;
  let weightSum = 0;
  let positionsWithDividends = 0;
  const totalValue = view.summary.totalValue;
  for (const v of view.valuations) {
    const fund = fundamentals.get(v.holding.ticker);
    if (!fund || typeof fund.dividendYield !== "number") continue;
    if (fund.dividendYield <= 0) continue;
    const weight = totalValue > 0 ? v.marketValueBase / totalValue : 0;
    weightedYield += fund.dividendYield * weight;
    weightSum += weight;
    positionsWithDividends += 1;
  }
  if (positionsWithDividends === 0 || weightSum === 0) {
    return {
      weightedYield: null,
      positionsWithDividends: 0,
      totalPositions: view.summary.positionCount,
      isIncomeObjective,
    };
  }
  return {
    weightedYield: weightedYield / weightSum,
    positionsWithDividends,
    totalPositions: view.summary.positionCount,
    isIncomeObjective,
  };
}

function buildFundamental(view: PortfolioView): FundamentalQualityInput {
  const totalValue = view.summary.totalValue;
  if (totalValue <= 0) {
    return { weightedQualityScore: null, coverage: 0 };
  }
  let weightedSum = 0;
  let coverWeight = 0;
  for (const v of view.valuations) {
    const score = v.holding.factorScore?.subScores.quality;
    if (typeof score !== "number" || !Number.isFinite(score)) continue;
    const weight = v.marketValueBase / totalValue;
    weightedSum += score * weight;
    coverWeight += weight;
  }
  if (coverWeight === 0) return { weightedQualityScore: null, coverage: 0 };
  return {
    weightedQualityScore: weightedSum / coverWeight,
    coverage: coverWeight,
  };
}

function buildValuation(view: PortfolioView): ValuationRiskInput {
  const totalValue = view.summary.totalValue;
  if (totalValue <= 0) {
    return { weightedValueScore: null, coverage: 0 };
  }
  let weightedSum = 0;
  let coverWeight = 0;
  for (const v of view.valuations) {
    const score = v.holding.factorScore?.subScores.value;
    if (typeof score !== "number" || !Number.isFinite(score)) continue;
    const weight = v.marketValueBase / totalValue;
    weightedSum += score * weight;
    coverWeight += weight;
  }
  if (coverWeight === 0) return { weightedValueScore: null, coverage: 0 };
  return {
    weightedValueScore: weightedSum / coverWeight,
    coverage: coverWeight,
  };
}

function buildMacro(
  view: PortfolioView,
  regime: MarketRegimeScore | null,
): MacroSensitivityInput {
  const totalValue = view.summary.totalValue;
  // Gewogen lowVol-sub-score
  let weightedLowVolSum = 0;
  let coverWeight = 0;
  if (totalValue > 0) {
    for (const v of view.valuations) {
      const score = v.holding.factorScore?.subScores.lowVol;
      if (typeof score !== "number" || !Number.isFinite(score)) continue;
      const weight = v.marketValueBase / totalValue;
      weightedLowVolSum += score * weight;
      coverWeight += weight;
    }
  }
  const weightedLowVolScore =
    coverWeight > 0 ? weightedLowVolSum / coverWeight : null;

  // Cyclische share = som van weights in cyclische sectoren
  const sectors = view.risk.exposures.bySector ?? [];
  let cyclicalShare: number | null = null;
  if (sectors.length > 0) {
    cyclicalShare = sectors
      .filter((s) => isCyclicalSector(s.label))
      .reduce((sum, s) => sum + s.weight, 0);
  }

  return {
    regimeStance: regime?.stance ?? null,
    weightedLowVolScore,
    cyclicalShare,
    riskSeverity: view.risk.overallSeverity ?? null,
  };
}

// ============================================================
//  Helpers
// ============================================================

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function isCyclicalSector(label: string): boolean {
  const lower = label.toLowerCase();
  return CYCLICAL_SECTOR_KEYWORDS.some((kw) => lower.includes(kw));
}
