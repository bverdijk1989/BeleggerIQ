import type { BacktestConfig } from "@/types/backtest";
import type { FactorScore } from "@/types/factor";
import type { MarketRegimeState } from "@/types/regime";

/**
 * Backtest-strategieën. Elk strategie is een pure functie van een
 * `StrategyContext` (universum, datum, prijsreeks, factor scores, regime)
 * naar een `StrategyDecision` (ticker → gewicht, sum ≈ 1).
 *
 * Aannames:
 *  - Factor scores zijn statisch binnen het backtest window (point-in-time
 *    fundamentals zijn niet beschikbaar). Momentum wordt wél dynamisch
 *    berekend uit de maandelijkse prijsreeks.
 *  - Selecties zijn equal-weight binnen de top-N; geen risk-budgeting.
 *  - Tickers zonder benodigde data vallen uit de ranking.
 */

export interface MonthlyBar {
  date: string; // "YYYY-MM"
  close: number;
}

export interface UniverseMember {
  ticker: string;
  name?: string;
  sector?: string | null;
  region?: string | null;
  /** Statische factor score — zelfde waarde over hele backtest. */
  factorScore?: FactorScore | null;
}

export interface StrategyContext {
  asOf: string; // "YYYY-MM"
  members: UniverseMember[];
  priceHistoryByTicker: Map<string, MonthlyBar[]>;
  config: BacktestConfig;
  regime: MarketRegimeState | null;
}

export interface StrategyDecision {
  weights: Map<string, number>;
  rationale?: string;
}

export type StrategyFn = (ctx: StrategyContext) => StrategyDecision;

export interface StrategyDefinition {
  slug: string;
  label: string;
  description: string;
  run: StrategyFn;
}

// ============================================================
//  Helpers
// ============================================================

export function computeMomentum12m(
  ticker: string,
  asOf: string,
  priceHistory: Map<string, MonthlyBar[]>,
): number | null {
  const series = priceHistory.get(ticker);
  if (!series || series.length === 0) return null;
  const idx = series.findIndex((p) => p.date === asOf);
  if (idx < 12) return null;
  const current = series[idx]!.close;
  const yearAgo = series[idx - 12]!.close;
  if (yearAgo <= 0 || current <= 0) return null;
  return current / yearAgo - 1;
}

/**
 * Bouw een gelijk-gewicht selectie van de top-N members op basis van een
 * score-functie. Members waarvoor `scoreFn` null retourneert worden
 * genegeerd. Retourneert een lege map als geen enkel member scoorde.
 */
export function topNEqualWeight(
  members: UniverseMember[],
  scoreFn: (m: UniverseMember) => number | null,
  maxPositions: number,
): Map<string, number> {
  const scored = members
    .map((m) => ({ m, score: scoreFn(m) }))
    .filter(
      (entry): entry is { m: UniverseMember; score: number } =>
        entry.score !== null && Number.isFinite(entry.score),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, maxPositions));

  if (scored.length === 0) return new Map();
  const weight = 1 / scored.length;
  return new Map(scored.map(({ m }) => [m.ticker, weight]));
}

function maxPositionsOrDefault(config: BacktestConfig): number {
  return config.maxPositions ?? 10;
}

// ============================================================
//  Strategies
// ============================================================

/** 1. Equal weight: top N tickers, gelijk verdeeld. */
export const equalWeightStrategy: StrategyFn = (ctx) => {
  const n = maxPositionsOrDefault(ctx.config);
  const tickers = ctx.members.slice(0, n).map((m) => m.ticker);
  if (tickers.length === 0) {
    return { weights: new Map(), rationale: "Leeg universe." };
  }
  const w = 1 / tickers.length;
  return {
    weights: new Map(tickers.map((t) => [t, w])),
    rationale: `Equal weight over ${tickers.length} posities.`,
  };
};

/** 2. Quality only: top N op `factorScore.subScores.quality`. */
export const qualityStrategy: StrategyFn = (ctx) => {
  const weights = topNEqualWeight(
    ctx.members,
    (m) => m.factorScore?.subScores.quality ?? null,
    maxPositionsOrDefault(ctx.config),
  );
  return {
    weights,
    rationale: "Top quality-scores, equal weight.",
  };
};

/** 3. Quality + Value: gewogen composite 0.5 Q + 0.5 V. */
export const qualityValueStrategy: StrategyFn = (ctx) => {
  const weights = topNEqualWeight(
    ctx.members,
    (m) => {
      const q = m.factorScore?.subScores.quality;
      const v = m.factorScore?.subScores.value;
      if (q === undefined || v === undefined) return null;
      return 0.5 * q + 0.5 * v;
    },
    maxPositionsOrDefault(ctx.config),
  );
  return {
    weights,
    rationale: "Top 0.5·Quality + 0.5·Value, equal weight.",
  };
};

/**
 * 4. Quality + Momentum. Momentum is hier DYNAMISCH: 12m prijsmomentum
 * op basis van priceHistoryByTicker. Quality blijft statisch uit factor score.
 */
export const qualityMomentumStrategy: StrategyFn = (ctx) => {
  const weights = topNEqualWeight(
    ctx.members,
    (m) => {
      const q = m.factorScore?.subScores.quality;
      const momentum = computeMomentum12m(
        m.ticker,
        ctx.asOf,
        ctx.priceHistoryByTicker,
      );
      if (q === undefined || momentum === null) return null;
      // Map momentum (-0.2..+0.5) naar 0..100 range voor vergelijkbaarheid.
      const momentumScore = Math.max(
        0,
        Math.min(100, (momentum + 0.2) * 143),
      );
      return 0.5 * q + 0.5 * momentumScore;
    },
    maxPositionsOrDefault(ctx.config),
  );
  return {
    weights,
    rationale: "Top 0.5·Quality + 0.5·12m-momentum, equal weight.",
  };
};

/**
 * 5. Regime-aware allocation.
 *  - DEFENSIVE (recession): 0.5·quality + 0.5·lowVol.
 *  - RISK_ON (expansion, recovery): 0.3·quality + 0.7·12m-momentum.
 *  - NEUTRAL (slowdown, unknown): composite score.
 * In een risico-off regime blijft een extra cash buffer (20%) onbelegd.
 */
export const regimeAwareStrategy: StrategyFn = (ctx) => {
  const regime = ctx.regime;
  const stance = stanceFromState(regime);
  const n = maxPositionsOrDefault(ctx.config);

  let weights: Map<string, number>;
  let rationale: string;

  if (stance === "DEFENSIVE") {
    weights = topNEqualWeight(
      ctx.members,
      (m) => {
        const q = m.factorScore?.subScores.quality;
        const lowVol = m.factorScore?.subScores.lowVol;
        if (q === undefined || lowVol === undefined) return null;
        return 0.5 * q + 0.5 * lowVol;
      },
      n,
    );
    // Reserveer 20% cash door weights af te schalen.
    const scale = 0.8;
    weights = new Map(
      Array.from(weights.entries()).map(([t, w]) => [t, w * scale]),
    );
    rationale = "Defensief regime: quality + lowVol met 20% cash buffer.";
  } else if (stance === "RISK_ON") {
    weights = topNEqualWeight(
      ctx.members,
      (m) => {
        const q = m.factorScore?.subScores.quality;
        const momentum = computeMomentum12m(
          m.ticker,
          ctx.asOf,
          ctx.priceHistoryByTicker,
        );
        if (q === undefined || momentum === null) return null;
        const momentumScore = Math.max(
          0,
          Math.min(100, (momentum + 0.2) * 143),
        );
        return 0.3 * q + 0.7 * momentumScore;
      },
      n,
    );
    rationale = "Risk-on regime: 0.3·quality + 0.7·momentum.";
  } else {
    weights = topNEqualWeight(
      ctx.members,
      (m) => m.factorScore?.composite ?? null,
      n,
    );
    rationale = "Neutraal regime: composite factor score.";
  }

  return { weights, rationale };
};

function stanceFromState(
  state: MarketRegimeState | null,
): "RISK_ON" | "NEUTRAL" | "DEFENSIVE" {
  switch (state) {
    case "expansion":
    case "recovery":
      return "RISK_ON";
    case "recession":
      return "DEFENSIVE";
    case "slowdown":
    case "unknown":
    case null:
    default:
      return "NEUTRAL";
  }
}

// ============================================================
//  Registry
// ============================================================

export const STRATEGIES: Record<string, StrategyDefinition> = {
  "equal-weight": {
    slug: "equal-weight",
    label: "Equal weight",
    description: "Gelijke gewichten over de top-N tickers uit het universum.",
    run: equalWeightStrategy,
  },
  quality: {
    slug: "quality",
    label: "Quality only",
    description: "Top-N op quality sub-score, equal weight.",
    run: qualityStrategy,
  },
  "quality-value": {
    slug: "quality-value",
    label: "Quality + Value",
    description: "Composite 0.5·quality + 0.5·value, equal weight.",
    run: qualityValueStrategy,
  },
  "quality-momentum": {
    slug: "quality-momentum",
    label: "Quality + Momentum",
    description:
      "Composite 0.5·quality + 0.5·12m-momentum. Momentum dynamisch uit prijsreeks.",
    run: qualityMomentumStrategy,
  },
  "regime-aware": {
    slug: "regime-aware",
    label: "Regime-aware",
    description:
      "Defensief: quality + lowVol (20% cash). Risk-on: quality + momentum. Neutraal: composite.",
    run: regimeAwareStrategy,
  },
};

export function getStrategyBySlug(slug: string): StrategyDefinition | null {
  return STRATEGIES[slug] ?? null;
}
