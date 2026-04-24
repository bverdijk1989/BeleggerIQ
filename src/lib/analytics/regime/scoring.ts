import type { RegimeSubScore } from "@/types/regime";

/**
 * Per-driver scoring voor het market regime.
 *
 * Conventie: score 0..100 waar HOGER = meer risk-on / ondersteunend voor
 * risicovolle posities. Ontbrekende data levert `score: null` op; de
 * engine normaliseert gewichten dan over de actieve drivers.
 */

export interface RegimeScoreInput {
  // Valuation
  /** Cross-sectional percentile van marktwaardering (0..1, hoger = duurder). */
  valuationPercentile?: number | null;
  /** Alternatief: absolute P/E van de brede markt. */
  marketPe?: number | null;

  // Trend / breadth
  /** Fractie aandelen boven MA200 o.i.d., 0..1. */
  breadthScore?: number | null;
  /** 12-maands rendement van brede index, fractie. */
  index12mReturn?: number | null;

  // Volatility
  /** VIX-achtige volatility index (absolute waarde). */
  volatilityIndex?: number | null;

  // Rates
  /** 10y yield als fractie (0.045 = 4,5%). */
  interestRate10y?: number | null;
  /** Verandering 10y yield over 12 maanden (in procentpunten, 0.01 = 100 bps). */
  rateChange1y?: number | null;

  // Stress / spreads
  /** High-yield credit spread in basispunten. */
  creditSpreadBps?: number | null;
}

const WEIGHTS = {
  valuation: 0.2,
  trend: 0.3,
  volatility: 0.2,
  rates: 0.15,
  spread: 0.15,
} as const;

// ============================================================
//  Driver scorers
// ============================================================

export function scoreValuation(input: RegimeScoreInput): RegimeSubScore {
  const spec: RegimeSubScore = {
    key: "valuation",
    label: "Waardering",
    weight: WEIGHTS.valuation,
    score: null,
  };

  if (
    typeof input.valuationPercentile === "number" &&
    Number.isFinite(input.valuationPercentile)
  ) {
    const p = clamp01(input.valuationPercentile);
    // percentile 0 (cheap) → 90, percentile 1 (expensive) → 15
    spec.score = Math.round(90 - p * 75);
    spec.value = p;
    spec.rationale =
      p <= 0.3
        ? `Markt staat goedkoop (percentile ${pct(p)}).`
        : p >= 0.7
          ? `Markt is stevig geprijsd (percentile ${pct(p)}).`
          : `Waardering rond gemiddeld (percentile ${pct(p)}).`;
    return spec;
  }

  if (typeof input.marketPe === "number" && Number.isFinite(input.marketPe)) {
    // P/E 12 → 85, P/E 28 → 20, clamp daarbuiten
    const pe = input.marketPe;
    let score: number;
    if (pe <= 12) score = 85;
    else if (pe >= 28) score = 20;
    else score = Math.round(85 - ((pe - 12) / (28 - 12)) * 65);
    spec.score = score;
    spec.value = pe;
    spec.rationale =
      pe <= 14
        ? `Lage marktwaardering (P/E ${pe.toFixed(1)}).`
        : pe >= 22
          ? `Hoge marktwaardering (P/E ${pe.toFixed(1)}).`
          : `Gemiddelde waardering (P/E ${pe.toFixed(1)}).`;
    return spec;
  }

  return spec;
}

export function scoreTrend(input: RegimeScoreInput): RegimeSubScore {
  const spec: RegimeSubScore = {
    key: "trend",
    label: "Brede markttrend",
    weight: WEIGHTS.trend,
    score: null,
  };

  const signals: Array<{ s: number; w: number; r: string }> = [];

  if (
    typeof input.breadthScore === "number" &&
    Number.isFinite(input.breadthScore)
  ) {
    const b = clamp01(input.breadthScore);
    const breadthScore = Math.round(b * 100);
    signals.push({
      s: breadthScore,
      w: 0.6,
      r: `${pct(b)} van aandelen boven trend-MA.`,
    });
  }

  if (
    typeof input.index12mReturn === "number" &&
    Number.isFinite(input.index12mReturn)
  ) {
    const r = input.index12mReturn;
    let score: number;
    if (r <= -0.2) score = 15;
    else if (r >= 0.25) score = 90;
    else score = Math.round(15 + ((r + 0.2) / 0.45) * 75);
    signals.push({
      s: score,
      w: 0.4,
      r: `Index 12m ${signedPct(r)}.`,
    });
  }

  if (signals.length === 0) return spec;

  const totalWeight = signals.reduce((s, x) => s + x.w, 0);
  const weighted = signals.reduce((s, x) => s + x.s * x.w, 0) / totalWeight;
  spec.score = Math.round(weighted);
  spec.rationale = signals
    .slice()
    .sort((a, b) => Math.abs(b.s - 50) - Math.abs(a.s - 50))[0]!.r;
  return spec;
}

export function scoreVolatility(input: RegimeScoreInput): RegimeSubScore {
  const spec: RegimeSubScore = {
    key: "volatility",
    label: "Volatiliteit",
    weight: WEIGHTS.volatility,
    score: null,
  };

  if (
    typeof input.volatilityIndex === "number" &&
    Number.isFinite(input.volatilityIndex)
  ) {
    const v = input.volatilityIndex;
    let score: number;
    if (v <= 13) score = 90;
    else if (v >= 35) score = 15;
    else if (v <= 18) score = Math.round(90 - ((v - 13) / 5) * 20);
    else if (v <= 25) score = Math.round(70 - ((v - 18) / 7) * 25);
    else score = Math.round(45 - ((v - 25) / 10) * 30);

    spec.score = score;
    spec.value = v;
    spec.rationale =
      v <= 15
        ? `Rustige markt (VIX-proxy ${v.toFixed(1)}).`
        : v >= 28
          ? `Verhoogde volatiliteit (VIX-proxy ${v.toFixed(1)}).`
          : `Normale volatiliteit (VIX-proxy ${v.toFixed(1)}).`;
  }

  return spec;
}

export function scoreRates(input: RegimeScoreInput): RegimeSubScore {
  const spec: RegimeSubScore = {
    key: "rates",
    label: "Rentecontext",
    weight: WEIGHTS.rates,
    score: null,
  };

  if (
    typeof input.interestRate10y === "number" &&
    Number.isFinite(input.interestRate10y)
  ) {
    const r = input.interestRate10y;
    let baseScore: number;
    if (r <= 0.01) baseScore = 80;
    else if (r <= 0.025) baseScore = 75;
    else if (r <= 0.035) baseScore = 65;
    else if (r <= 0.045) baseScore = 50;
    else if (r <= 0.06) baseScore = 35;
    else baseScore = 20;

    // Snelle rentestijging drukt de score; daling tilt hem op.
    if (
      typeof input.rateChange1y === "number" &&
      Number.isFinite(input.rateChange1y)
    ) {
      const dy = input.rateChange1y;
      if (dy >= 0.015) baseScore -= 15;
      else if (dy >= 0.005) baseScore -= 5;
      else if (dy <= -0.015) baseScore += 15;
      else if (dy <= -0.005) baseScore += 5;
    }

    spec.score = clampScore(baseScore);
    spec.value = r;
    spec.rationale =
      r <= 0.025
        ? `Rente 10y ${pct(r)} — monetair supportief.`
        : r >= 0.045
          ? `Rente 10y ${pct(r)} — restrictief voor risk assets.`
          : `Rente 10y ${pct(r)} — neutraal.`;
  }

  return spec;
}

export function scoreSpread(input: RegimeScoreInput): RegimeSubScore {
  const spec: RegimeSubScore = {
    key: "spread",
    label: "Credit spread",
    weight: WEIGHTS.spread,
    score: null,
  };

  if (
    typeof input.creditSpreadBps === "number" &&
    Number.isFinite(input.creditSpreadBps)
  ) {
    const bps = input.creditSpreadBps;
    let score: number;
    if (bps <= 150) score = 85;
    else if (bps >= 600) score = 15;
    else if (bps <= 300) score = Math.round(85 - ((bps - 150) / 150) * 25);
    else score = Math.round(60 - ((bps - 300) / 300) * 45);

    spec.score = score;
    spec.value = bps;
    spec.rationale =
      bps <= 200
        ? `Spreads tight (${Math.round(bps)} bps) — weinig stress.`
        : bps >= 400
          ? `Spreads wijd (${Math.round(bps)} bps) — stress signalen.`
          : `Spreads gemiddeld (${Math.round(bps)} bps).`;
  }

  return spec;
}

/**
 * Produceer alle sub-scores in één aanroep. Handig voor de engine en tests.
 */
export function scoreAllDrivers(input: RegimeScoreInput): RegimeSubScore[] {
  return [
    scoreValuation(input),
    scoreTrend(input),
    scoreVolatility(input),
    scoreRates(input),
    scoreSpread(input),
  ];
}

// ============================================================
//  Internals
// ============================================================

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 50;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signedPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value * 100)}%`;
}
