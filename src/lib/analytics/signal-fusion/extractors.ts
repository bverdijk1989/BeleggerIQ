/**
 * 10 signal-extractors — pure functies.
 *
 * Elke extractor:
 *  - input: relevant deel van `SignalFusionInput`
 *  - output: `SignalContribution` met score / rationale / dataQuality
 *
 * **Conventies**:
 *  - Score 0..100 of `null` (geen data).
 *  - Rationale = 1 zin NL met concrete cijfers waar mogelijk.
 *  - DataQuality wordt door de extractor zelf gezet — niet door engine.
 *  - Geen `Date.now()` of randomness; gebruik `asOf` indien nodig.
 */

import type { SignalFusionInput } from "./input";
import type {
  SignalContribution,
  SignalDataQuality,
  SignalKey,
} from "./types";
import { SIGNAL_LABELS } from "./types";

// ============================================================
//  Helpers
// ============================================================

const NEUTRAL_SCORE = 50;

interface PartialContribution {
  score: number | null;
  rationale: string;
  dataQuality: SignalDataQuality;
  metric?: number | null;
  source: string;
}

function toContribution(
  key: SignalKey,
  weight: number,
  partial: PartialContribution,
): SignalContribution {
  return {
    key,
    label: SIGNAL_LABELS[key],
    score: partial.score,
    weight,
    contribution: null, // engine vult dit in na renormalisatie
    rationale: partial.rationale,
    dataQuality: partial.dataQuality,
    metric: partial.metric ?? null,
    source: partial.source,
  };
}

function clamp(v: number, min = 0, max = 100): number {
  if (!Number.isFinite(v)) return NEUTRAL_SCORE;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

// ============================================================
//  1. Fundamental quality — uit factor-engine quality sub-score
// ============================================================

export function extractFundamentalQuality(
  input: SignalFusionInput,
  weight: number,
): SignalContribution {
  const factor = input.instrument.factorScore;
  const fundamentals = input.instrument.fundamentals;
  if (!factor || typeof factor.subScores.quality !== "number") {
    return toContribution("fundamental_quality", weight, {
      score: null,
      rationale: "Geen factor-engine quality-score beschikbaar.",
      dataQuality: "missing",
      source: "factor-engine",
    });
  }
  const quality = factor.subScores.quality;
  const roic =
    fundamentals?.roic !== undefined && fundamentals.roic !== null
      ? `${(fundamentals.roic * 100).toFixed(1)}%`
      : null;
  const debtEq =
    fundamentals?.debtToEquity !== undefined && fundamentals.debtToEquity !== null
      ? fundamentals.debtToEquity.toFixed(2)
      : null;
  const detail = [
    roic ? `ROIC ${roic}` : null,
    debtEq ? `D/E ${debtEq}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const rationale = detail
    ? `Quality-score ${Math.round(quality)}/100 (${detail}).`
    : `Quality-score ${Math.round(quality)}/100 uit fundamentals.`;
  return toContribution("fundamental_quality", weight, {
    score: clamp(quality),
    rationale,
    dataQuality: factor.confidence && factor.confidence > 0.7 ? "high" : "medium",
    metric: quality,
    source: "factor-engine",
  });
}

// ============================================================
//  2. Valuation — uit factor-engine value sub-score
// ============================================================

export function extractValuation(
  input: SignalFusionInput,
  weight: number,
): SignalContribution {
  const factor = input.instrument.factorScore;
  const fundamentals = input.instrument.fundamentals;
  if (!factor || typeof factor.subScores.value !== "number") {
    return toContribution("valuation", weight, {
      score: null,
      rationale: "Geen value-score beschikbaar — multiples ontbreken.",
      dataQuality: "missing",
      source: "factor-engine",
    });
  }
  const value = factor.subScores.value;
  const pe =
    fundamentals?.pe !== undefined && fundamentals.pe !== null
      ? `P/E ${fundamentals.pe.toFixed(1)}`
      : null;
  const fcfYield =
    fundamentals?.fcfYield !== undefined && fundamentals.fcfYield !== null
      ? `FCF yield ${(fundamentals.fcfYield * 100).toFixed(1)}%`
      : null;
  const detail = [pe, fcfYield].filter(Boolean).join(", ");
  const rationale = detail
    ? `Value-score ${Math.round(value)}/100 (${detail}); ${
        value >= 65 ? "aantrekkelijk geprijsd" : value <= 35 ? "duur t.o.v. peers" : "neutraal"
      }.`
    : `Value-score ${Math.round(value)}/100 uit factor-engine.`;
  return toContribution("valuation", weight, {
    score: clamp(value),
    rationale,
    dataQuality: factor.confidence && factor.confidence > 0.7 ? "high" : "medium",
    metric: value,
    source: "factor-engine",
  });
}

// ============================================================
//  3. Momentum
// ============================================================

export function extractMomentum(
  input: SignalFusionInput,
  weight: number,
): SignalContribution {
  const factor = input.instrument.factorScore;
  if (!factor || typeof factor.subScores.momentum !== "number") {
    return toContribution("momentum", weight, {
      score: null,
      rationale: "Onvoldoende koershistorie voor momentum-score.",
      dataQuality: "missing",
      source: "factor-engine",
    });
  }
  const m = factor.subScores.momentum;
  const rationale = `Momentum-score ${Math.round(m)}/100 over de afgelopen 12 maanden — ${
    m >= 65 ? "kracht in trend" : m <= 35 ? "negatieve trend" : "rustige trend"
  }.`;
  return toContribution("momentum", weight, {
    score: clamp(m),
    rationale,
    dataQuality: factor.confidence && factor.confidence > 0.6 ? "high" : "medium",
    metric: m,
    source: "factor-engine",
  });
}

// ============================================================
//  4. Volatiliteit (lowVol invert: hoger lowVol = lager risico)
// ============================================================

export function extractVolatility(
  input: SignalFusionInput,
  weight: number,
): SignalContribution {
  const factor = input.instrument.factorScore;
  if (!factor || typeof factor.subScores.lowVol !== "number") {
    return toContribution("volatility", weight, {
      score: null,
      rationale: "Geen volatility-meting beschikbaar.",
      dataQuality: "missing",
      source: "factor-engine",
    });
  }
  const lowVol = factor.subScores.lowVol;
  // lowVol-sub-score: hoger = stabieler → past direct als signaal-score.
  const rationale = `Volatility-score ${Math.round(lowVol)}/100; ${
    lowVol >= 65 ? "stabiel risicoprofiel" : lowVol <= 35 ? "verhoogd risicoprofiel" : "gemiddeld risico"
  }.`;
  return toContribution("volatility", weight, {
    score: clamp(lowVol),
    rationale,
    dataQuality: factor.confidence && factor.confidence > 0.6 ? "high" : "medium",
    metric: lowVol,
    source: "factor-engine",
  });
}

// ============================================================
//  5. Earnings revisions — placeholder slot (Wood-laag)
// ============================================================

export function extractEarningsRevisions(
  input: SignalFusionInput,
  weight: number,
): SignalContribution {
  const er = input.earningsRevisions;
  if (!er || (er.upgrades === 0 && er.downgrades === 0)) {
    return toContribution("earnings_revisions", weight, {
      score: null,
      rationale: "Earnings-revision feed niet aangesloten of geen recente revisies.",
      dataQuality: "missing",
      source: "external-feed",
    });
  }
  // Net-revision ratio: (up − down) / max(up + down, 1) → -1..+1 → 10..90.
  const total = er.upgrades + er.downgrades;
  const netRatio = (er.upgrades - er.downgrades) / Math.max(total, 1);
  const score = clamp(50 + netRatio * 40);
  const rationale = `${er.upgrades} opwaartse vs ${er.downgrades} neerwaartse revisies (90d) — ${
    netRatio > 0.3 ? "duidelijk positief" : netRatio < -0.3 ? "duidelijk negatief" : "gemengd"
  }.`;
  return toContribution("earnings_revisions", weight, {
    score,
    rationale,
    dataQuality: total >= 5 ? "high" : "medium",
    metric: netRatio,
    source: er.source,
  });
}

// ============================================================
//  6. Dividend kwaliteit
// ============================================================

export function extractDividendQuality(
  input: SignalFusionInput,
  weight: number,
): SignalContribution {
  const f = input.instrument.fundamentals;
  if (!f || typeof f.dividendYield !== "number") {
    return toContribution("dividend_quality", weight, {
      score: null,
      rationale: "Geen dividend-data — ticker betaalt mogelijk geen dividend.",
      dataQuality: "missing",
      source: "fundamentals",
    });
  }
  const yield_ = f.dividendYield;
  const payout = typeof f.payoutRatio === "number" ? f.payoutRatio : null;
  const growth =
    typeof f.dividendGrowth5y === "number" ? f.dividendGrowth5y : null;

  // Yield-component:
  //   ≤ 0% → 30 (geen dividend)
  //   2-4% → 80 (sweet spot)
  //   ≥ 7% → 40 (yield-trap-risk)
  let yieldScore: number;
  if (yield_ <= 0) yieldScore = 30;
  else if (yield_ <= 0.04) yieldScore = 50 + (yield_ / 0.04) * 30;
  else if (yield_ <= 0.07) yieldScore = 80 - ((yield_ - 0.04) / 0.03) * 10;
  else yieldScore = 70 - Math.min(30, (yield_ - 0.07) * 200);

  // Payout-component (ratio < 0.6 = duurzaam, > 0.9 = waarschuwing).
  let payoutScore: number | null = null;
  if (payout !== null) {
    if (payout < 0) payoutScore = 30;
    else if (payout <= 0.6) payoutScore = 90;
    else if (payout <= 0.85) payoutScore = 70;
    else payoutScore = 40;
  }

  // Groei-component (5y CAGR positief = goed).
  let growthScore: number | null = null;
  if (growth !== null) {
    if (growth > 0.05) growthScore = 85;
    else if (growth > 0) growthScore = 70;
    else if (growth > -0.02) growthScore = 50;
    else growthScore = 30;
  }

  const components = [yieldScore, payoutScore, growthScore].filter(
    (v): v is number => typeof v === "number",
  );
  const score = clamp(components.reduce((s, v) => s + v, 0) / components.length);

  const detailParts = [
    `yield ${(yield_ * 100).toFixed(1)}%`,
    payout !== null ? `payout ${(payout * 100).toFixed(0)}%` : null,
    growth !== null ? `groei ${(growth * 100).toFixed(1)}%/jr` : null,
  ].filter(Boolean);

  const dataQuality: SignalDataQuality =
    components.length >= 3 ? "high" : components.length >= 2 ? "medium" : "low";

  return toContribution("dividend_quality", weight, {
    score,
    rationale: `Dividend ${detailParts.join(", ")}; ${
      score >= 70 ? "duurzaam dividendprofiel" : score >= 50 ? "redelijk" : "kwetsbaar"
    }.`,
    dataQuality,
    metric: yield_,
    source: "fundamentals",
  });
}

// ============================================================
//  7. Macro-sensitivity — uit huidige macro-regime × asset-class
// ============================================================

export function extractMacroSensitivity(
  input: SignalFusionInput,
  weight: number,
): SignalContribution {
  const macro = input.macroRegime;
  const assetKey = input.instrument.assetClassKey;
  if (!macro || !assetKey) {
    return toContribution("macro_sensitivity", weight, {
      score: null,
      rationale: "Geen macro-classificatie of asset-class-mapping beschikbaar.",
      dataQuality: "missing",
      source: "macro-regime",
    });
  }
  const impact = macro.assetMapping.impacts.find((i) => i.assetClass === assetKey);
  if (!impact) {
    return toContribution("macro_sensitivity", weight, {
      score: 50,
      rationale: `Geen specifieke macro-impact bekend voor deze asset-class in ${macro.classification.regime}-regime.`,
      dataQuality: "low",
      source: "macro-regime",
    });
  }
  // tailwind → 65..90 (afhankelijk van magnitude); headwind → 10..35; neutral → 50.
  let score: number;
  if (impact.direction === "tailwind") score = 50 + impact.magnitude * 40;
  else if (impact.direction === "headwind") score = 50 - impact.magnitude * 40;
  else score = 50;
  return toContribution("macro_sensitivity", weight, {
    score: clamp(score),
    rationale: `${macro.classification.regime}-regime: ${impact.label.toLowerCase()} krijgt ${
      impact.direction === "tailwind"
        ? "rugwind"
        : impact.direction === "headwind"
          ? "tegenwind"
          : "neutrale impact"
    } (${impact.rationale.toLowerCase()})`,
    dataQuality: "medium",
    metric: impact.magnitude,
    source: "macro-regime",
  });
}

// ============================================================
//  8. Sentiment — placeholder slot
// ============================================================

export function extractSentiment(
  input: SignalFusionInput,
  weight: number,
): SignalContribution {
  const s = input.sentiment;
  if (!s) {
    return toContribution("sentiment", weight, {
      score: null,
      rationale: "Sentiment-feed niet aangesloten.",
      dataQuality: "missing",
      source: "external-feed",
    });
  }
  // Sentiment: -1..+1 → 0..100.
  const score = clamp(50 + s.score * 50);
  const rationale = `Sentiment-score ${(s.score * 100).toFixed(0)}/100 (${s.sampleSize} datapunten); ${
    s.score > 0.2 ? "positief" : s.score < -0.2 ? "negatief" : "neutraal"
  }.`;
  return toContribution("sentiment", weight, {
    score,
    rationale,
    dataQuality: s.sampleSize >= 50 ? "high" : s.sampleSize >= 20 ? "medium" : "low",
    metric: s.score,
    source: s.source,
  });
}

// ============================================================
//  9. Insider / analyst — placeholder slot
// ============================================================

export function extractInsiderAnalyst(
  input: SignalFusionInput,
  weight: number,
): SignalContribution {
  const ia = input.insiderAnalyst;
  if (!ia) {
    return toContribution("insider_analyst", weight, {
      score: null,
      rationale: "Insider/analyst-feed niet aangesloten.",
      dataQuality: "missing",
      source: "external-feed",
    });
  }
  const components: number[] = [];
  const detailParts: string[] = [];

  // Insider: net buying score is al een gestandaardiseerde 0..100 of similar.
  if (typeof ia.insiderNetBuyingScore === "number") {
    components.push(clamp(ia.insiderNetBuyingScore));
    detailParts.push(`insider-buy ${Math.round(ia.insiderNetBuyingScore)}`);
  }
  // Analyst-rating 1..5: 1=strong sell → score 10, 5=strong buy → score 90.
  if (typeof ia.averageAnalystRating === "number" && ia.averageAnalystRating >= 1) {
    const r = ia.averageAnalystRating;
    const score = clamp(10 + (Math.min(5, r) - 1) * 20);
    components.push(score);
    detailParts.push(`${ia.analystCount ?? "?"} analysts ${r.toFixed(1)}/5`);
  }
  if (components.length === 0) {
    return toContribution("insider_analyst", weight, {
      score: null,
      rationale: "Geen insider- of analyst-data beschikbaar voor deze ticker.",
      dataQuality: "missing",
      source: ia.source,
    });
  }
  const score = clamp(components.reduce((a, b) => a + b, 0) / components.length);
  return toContribution("insider_analyst", weight, {
    score,
    rationale: `${detailParts.join(", ")}; ${
      score >= 65 ? "constructief" : score <= 35 ? "voorzichtig" : "neutraal"
    }.`,
    dataQuality: components.length >= 2 ? "high" : "medium",
    metric: score,
    source: ia.source,
  });
}

// ============================================================
//  10. Portfolio-fit — gegeven huidige weging + concentratie
// ============================================================

export function extractPortfolioFit(
  input: SignalFusionInput,
  weight: number,
): SignalContribution {
  const ctx = input.portfolio;
  if (!ctx) {
    return toContribution("portfolio_fit", weight, {
      score: null,
      rationale: "Geen portefeuille-context beschikbaar — kan fit niet berekenen.",
      dataQuality: "missing",
      source: "portfolio-view",
    });
  }
  // Drie dimensies samen:
  //  - currentWeight (lager = ruimte voor bijkopen, hoger = al groot)
  //  - sectorWeight (idem)
  //  - positionCount (laag → ruimte voor diversificatie)
  // Doel: signaal is HOOG wanneer toevoegen/aanhouden de portefeuille
  // diversifieert, LAAG wanneer het concentratie verhoogt.

  const currentWeight = clamp01(ctx.currentWeight);
  const sectorWeight = clamp01(ctx.sectorWeight);
  const positionCount = ctx.positionCount;

  // currentWeight: 0% → 80, 5% → 70, 10% → 50, 20% → 20, ≥30% → 5
  const weightScore =
    currentWeight === 0
      ? 80
      : currentWeight <= 0.05
        ? 70
        : currentWeight <= 0.10
          ? 50
          : currentWeight <= 0.20
            ? 30
            : currentWeight <= 0.30
              ? 15
              : 5;

  // sectorWeight: < 15% → 80, 30% → 60, 45% → 30, ≥ 60% → 10.
  const sectorScore =
    sectorWeight <= 0.15
      ? 80
      : sectorWeight <= 0.30
        ? 70
        : sectorWeight <= 0.45
          ? 45
          : sectorWeight <= 0.60
            ? 25
            : 10;

  // positionCount: < 5 → bonus voor diversificatie (toevoegen helpt).
  const countBonus = positionCount < 5 ? 10 : positionCount < 10 ? 5 : 0;

  const score = clamp(weightScore * 0.5 + sectorScore * 0.4 + countBonus);

  const rationale = `Huidige weging ${(currentWeight * 100).toFixed(1)}%, sector ${(sectorWeight * 100).toFixed(1)}% (${positionCount} posities); ${
    score >= 65 ? "ruimte voor verhoging" : score <= 35 ? "voegt concentratie toe" : "neutrale fit"
  }.`;
  return toContribution("portfolio_fit", weight, {
    score,
    rationale,
    dataQuality: "high",
    metric: currentWeight,
    source: "portfolio-view",
  });
}

function clamp01(v: number): number {
  if (!Number.isFinite(v) || v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// ============================================================
//  Registry
// ============================================================

export const ALL_EXTRACTORS: ReadonlyArray<{
  key: SignalKey;
  extract: (input: SignalFusionInput, weight: number) => SignalContribution;
}> = [
  { key: "fundamental_quality", extract: extractFundamentalQuality },
  { key: "valuation", extract: extractValuation },
  { key: "momentum", extract: extractMomentum },
  { key: "volatility", extract: extractVolatility },
  { key: "earnings_revisions", extract: extractEarningsRevisions },
  { key: "dividend_quality", extract: extractDividendQuality },
  { key: "macro_sensitivity", extract: extractMacroSensitivity },
  { key: "sentiment", extract: extractSentiment },
  { key: "insider_analyst", extract: extractInsiderAnalyst },
  { key: "portfolio_fit", extract: extractPortfolioFit },
];
