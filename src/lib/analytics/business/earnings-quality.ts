import type { FundamentalsSnapshot } from "@/types/factor";

import { aggregate, fmtPct, scaleStrength, type Component } from "./moat";
import type { BusinessSubScore } from "./types";

/**
 * Earnings-quality score (0..100) — proxy voor stabiliteit + groei.
 *
 * Pillars (alle uit `FundamentalsSnapshot`, geen externe historie nodig):
 *   1. **5y revenue growth** — een 5-jaars-CAGR uit de provider. ≥ 10%
 *      is sterk, ≤ 0% wijst op stagnerend businessmodel.
 *   2. **5y EPS growth** — winstgroei (kan harder dan revenue groeien
 *      bij operating leverage). Drempels iets hoger want EPS schommelt.
 *   3. **TTM revenue growth** — recente trend; bevestigt of de 5y
 *      historie nog actueel is.
 *   4. **Net margin** — eindwinstgevendheid. ≥ 15% = top kwartiel.
 *
 * Notitie: zonder year-over-year volatility kunnen we niet meten of
 * earnings glad zijn (lage σ). We gebruiken 5y-CAGR als imperfect proxy:
 * een bedrijf dat 5y compound 10%+ groeit zonder grote ttm-omkering
 * heeft *meestal* stabielere winsten dan een bedrijf met negatieve
 * groei. Dit is expliciet een heuristiek; daarom bouwt deze score op
 * deelvelden i.p.v. een vol-curve te eisen.
 */

const WEIGHTS = {
  revenueGrowth5y: 0.3,
  epsGrowth5y: 0.3,
  revenueGrowthTtm: 0.2,
  netMargin: 0.2,
} as const;

const THRESHOLDS = {
  revenueGrowth5y: { min: 0, max: 0.1 },
  epsGrowth5y: { min: 0, max: 0.15 },
  revenueGrowthTtm: { min: -0.05, max: 0.1 },
  netMargin: { min: 0.05, max: 0.15 },
} as const;

export function scoreEarningsQuality(
  fundamentals: FundamentalsSnapshot | null,
): BusinessSubScore {
  if (!fundamentals) {
    return {
      score: 50,
      rationale: [
        "Geen fundamentals — neutrale earnings-quality (50).",
      ],
      coverage: 0,
    };
  }

  const components: Component[] = [
    componentWith(
      "Revenue groei 5j",
      WEIGHTS.revenueGrowth5y,
      fundamentals.revenueGrowth5y,
      THRESHOLDS.revenueGrowth5y,
    ),
    componentWith(
      "EPS groei 5j",
      WEIGHTS.epsGrowth5y,
      fundamentals.epsGrowth5y,
      THRESHOLDS.epsGrowth5y,
    ),
    componentWith(
      "Revenue groei TTM",
      WEIGHTS.revenueGrowthTtm,
      fundamentals.revenueGrowthTtm,
      THRESHOLDS.revenueGrowthTtm,
    ),
    componentWith(
      "Net margin",
      WEIGHTS.netMargin,
      fundamentals.netMargin,
      THRESHOLDS.netMargin,
    ),
  ];

  // Penalty voor disconnect tussen 5y- en TTM-groei: als 5y +10% maar
  // TTM negatief, kan dit op kantelpunt wijzen. We loggen dit als
  // rationale-bullet maar passen geen score-aanpassing toe (deelscores
  // doen het zelf al).
  const subScore = aggregate(components);
  if (
    fundamentals.revenueGrowth5y !== undefined &&
    fundamentals.revenueGrowthTtm !== undefined &&
    fundamentals.revenueGrowth5y > 0.05 &&
    fundamentals.revenueGrowthTtm < -0.02
  ) {
    subScore.rationale.push(
      `Disconnect: 5y +${(fundamentals.revenueGrowth5y * 100).toFixed(1)}% vs TTM ${(fundamentals.revenueGrowthTtm * 100).toFixed(1)}% — let op kantelpunt.`,
    );
  }
  return subScore;
}

// ============================================================
//  Lokale helper — wrapper rondom shared `component`
// ============================================================

function componentWith(
  label: string,
  weight: number,
  value: number | null | undefined,
  thresholds: { min: number; max: number },
): Component {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return { label, weight, score: 50, raw: null, text: null };
  }
  const score = scaleStrength(value, thresholds.min, thresholds.max);
  return {
    label,
    weight,
    score,
    raw: value,
    text: `${label} ${fmtPct(value)}.`,
  };
}
