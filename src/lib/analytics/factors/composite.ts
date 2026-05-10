import type {
  FactorRationales,
  FactorScore,
  FactorSubScores,
  FactorWeights,
  FundamentalsSnapshot,
} from "@/types/factor";
import type { HistoricalPoint } from "@/types/market";
import type { Holding } from "@/types/portfolio";
import type { InvestmentObjective } from "@/types/profile";

import { scoreMomentum } from "./momentum";
import { scoreQuality } from "./quality";
import { scoreRisk } from "./risk";
import { computeCompositeStdErr } from "./error-band";
import { clamp } from "./shared";
import { scoreValue } from "./value";

/**
 * Composite factor orchestrator. Combineert quality/value/momentum/risk
 * sub-scores tot één 0..100 eindcijfer en levert rationale + gebruikte
 * gewichten mee voor explainability.
 */

export const DEFAULT_FACTOR_WEIGHTS: FactorWeights = {
  quality: 0.3,
  value: 0.25,
  momentum: 0.25,
  lowVol: 0.2,
};

/**
 * Gewichten per InvestmentObjective. De som hoeft niet exact 1 te zijn —
 * de composite-berekening normaliseert binnen de vier kernfactoren.
 */
export function weightsForObjective(
  objective: InvestmentObjective,
): FactorWeights {
  switch (objective) {
    case "GROWTH":
      return { quality: 0.3, value: 0.1, momentum: 0.4, lowVol: 0.2, growth: 0.2 };
    case "INCOME":
      return {
        quality: 0.3,
        value: 0.3,
        momentum: 0.1,
        lowVol: 0.3,
        dividend: 0.2,
      };
    case "CAPITAL_PRESERVATION":
      return { quality: 0.35, value: 0.25, momentum: 0.1, lowVol: 0.3 };
    case "RETIREMENT":
      return {
        quality: 0.3,
        value: 0.25,
        momentum: 0.15,
        lowVol: 0.3,
        dividend: 0.1,
      };
    case "FIRE":
      return { quality: 0.3, value: 0.2, momentum: 0.3, lowVol: 0.2 };
    case "BALANCED":
    case "CUSTOM":
    default:
      return DEFAULT_FACTOR_WEIGHTS;
  }
}

export interface FactorScoringInput {
  ticker: string;
  asOf?: string;
  fundamentals?: FundamentalsSnapshot | null;
  priceHistory?: HistoricalPoint[] | null;
  volatility?: number | null;
  maxDrawdown?: number | null;
  beta?: number | null;
}

/**
 * Coverage-drempel waaronder een sub-score als "onvoldoende data" wordt
 * behandeld voor de composite-berekening.
 *
 * Asness/Simons-rationale: een momentum-pillar met 1 van 4 signalen
 * heeft `coverage = 0.25`, maar werd voorheen gewoon meegewogen in de
 * composite. Dat is **fake precision** — een composite van 65 op basis
 * van 1 signaal suggereert meer overtuiging dan er statistisch is.
 *
 * Sub-scores onder deze drempel blijven zichtbaar in `subScores` (UI-
 * weergave), maar tellen **niet** mee in de composite. Wanneer minder
 * dan `MIN_PILLARS_FOR_COMPOSITE` pillars overblijven wordt composite
 * naar 50 geforceerd en confidence geclamped op
 * `MAX_CONFIDENCE_LOW_COVERAGE`.
 */
export const MIN_COVERAGE_FOR_COMPOSITE = 0.5;
export const MIN_PILLARS_FOR_COMPOSITE = 2;
export const MAX_CONFIDENCE_LOW_COVERAGE = 0.3;

type PillarKey = "quality" | "value" | "momentum" | "lowVol";
type ReliablePillars = Record<PillarKey, boolean>;

/**
 * Kern-API: bouwt een volledige `FactorScore` voor één ticker.
 * Veilig bij missende velden — sub-scores onder de coverage-drempel
 * worden uit de composite-berekening gehouden om fake precision te
 * voorkomen.
 */
export function scoreFactors(
  input: FactorScoringInput,
  weights: FactorWeights = DEFAULT_FACTOR_WEIGHTS,
): FactorScore {
  const quality = scoreQuality(input.fundamentals);
  const value = scoreValue(input.fundamentals);
  const momentum = scoreMomentum(input.priceHistory);
  const risk = scoreRisk({
    volatility: input.volatility,
    maxDrawdown: input.maxDrawdown,
    beta: input.beta,
  });

  const subScores: FactorSubScores = {
    quality: quality.score,
    value: value.score,
    momentum: momentum.score,
    lowVol: risk.score,
  };

  const reliablePillars: ReliablePillars = {
    quality: quality.coverage >= MIN_COVERAGE_FOR_COMPOSITE,
    value: value.coverage >= MIN_COVERAGE_FOR_COMPOSITE,
    momentum: momentum.coverage >= MIN_COVERAGE_FOR_COMPOSITE,
    lowVol: risk.coverage >= MIN_COVERAGE_FOR_COMPOSITE,
  };
  const reliableCount = Object.values(reliablePillars).filter(Boolean).length;

  const composite =
    reliableCount >= MIN_PILLARS_FOR_COMPOSITE
      ? computeComposite(subScores, weights, reliablePillars)
      : 50;

  const rationales: FactorRationales = {
    quality: quality.rationales,
    value: value.rationales,
    momentum: momentum.rationales,
    lowVol: risk.rationales,
    composite: buildCompositeRationale(
      subScores,
      weights,
      composite,
      reliableCount,
    ),
  };

  const coverageSignals = [quality, value, momentum, risk];
  const rawConfidence =
    coverageSignals.reduce((sum, s) => sum + s.coverage, 0) /
    coverageSignals.length;
  const confidence =
    reliableCount >= MIN_PILLARS_FOR_COMPOSITE
      ? clamp(rawConfidence, 0, 1)
      : Math.min(MAX_CONFIDENCE_LOW_COVERAGE, clamp(rawConfidence, 0, 1));

  // Error-band berekening (M17): hoe lager de coverage van de pillars,
  // hoe groter de stdErr op de composite. Voorkomt schijnzekerheid in
  // de UI ("65/100" vs "65 ± 12").
  const compositeStdErr = computeCompositeStdErr({
    weights,
    pillars: [
      { key: "quality", coverage: quality.coverage, reliable: reliablePillars.quality },
      { key: "value", coverage: value.coverage, reliable: reliablePillars.value },
      { key: "momentum", coverage: momentum.coverage, reliable: reliablePillars.momentum },
      { key: "lowVol", coverage: risk.coverage, reliable: reliablePillars.lowVol },
    ],
  });

  return {
    ticker: input.ticker,
    asOf: input.asOf ?? new Date().toISOString(),
    subScores,
    composite,
    compositeStdErr,
    confidence,
    model: "beleggeriq.v1",
    weights,
    rationales,
  };
}

/**
 * Gewogen gemiddelde van de sub-scores. Wanneer `reliable` is gegeven,
 * worden alleen pillars met `reliable[key] === true` meegenomen — pillars
 * met te weinig coverage tellen niet mee om fake precision te
 * voorkomen.
 */
export function computeComposite(
  subScores: FactorSubScores,
  weights: FactorWeights,
  reliable?: ReliablePillars,
): number {
  const entries: Array<[PillarKey, number, number]> = [
    ["quality", subScores.quality, weights.quality],
    ["value", subScores.value, weights.value],
    ["momentum", subScores.momentum, weights.momentum],
    ["lowVol", subScores.lowVol, weights.lowVol],
  ];
  const filtered = reliable
    ? entries.filter(([key]) => reliable[key])
    : entries;
  const totalWeight = filtered.reduce((sum, [, , w]) => sum + w, 0);
  if (totalWeight === 0) return 50;
  const weighted =
    filtered.reduce((sum, [, score, weight]) => sum + score * weight, 0) /
    totalWeight;
  return Math.round(clamp(weighted, 0, 100));
}

function buildCompositeRationale(
  subScores: FactorSubScores,
  weights: FactorWeights,
  composite: number,
  reliableCount?: number,
): string[] {
  const entries: Array<[keyof FactorSubScores, number, number, string]> = [
    ["quality", subScores.quality, weights.quality, "Quality"],
    ["value", subScores.value, weights.value, "Value"],
    ["momentum", subScores.momentum, weights.momentum, "Momentum"],
    ["lowVol", subScores.lowVol, weights.lowVol, "Risk"],
  ];

  const totalWeight = entries.reduce((sum, [, , w]) => sum + w, 0) || 1;

  // Sorteer op gewogen bijdrage aan afwijking vs 50
  const ranked = entries
    .map(([key, score, weight, label]) => ({
      key,
      score,
      weight,
      label,
      contribution: ((score - 50) * weight) / totalWeight,
    }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const topPositive = ranked.find((r) => r.contribution > 5);
  const topNegative = ranked.find((r) => r.contribution < -5);
  const grade =
    composite >= 75
      ? "sterk"
      : composite >= 60
        ? "bovengemiddeld"
        : composite >= 40
          ? "gemiddeld"
          : composite >= 25
            ? "zwak"
            : "zeer zwak";

  const rationales: string[] = [
    `Composite score ${composite}/100 — ${grade} profiel.`,
  ];
  if (
    typeof reliableCount === "number" &&
    reliableCount < MIN_PILLARS_FOR_COMPOSITE
  ) {
    rationales.push(
      `Onvoldoende data (${reliableCount}/4 pillars met voldoende coverage) — composite gehouden op neutraal en confidence beperkt.`,
    );
  }
  if (topPositive) {
    rationales.push(
      `${topPositive.label} trekt de score omhoog (${topPositive.score}/100).`,
    );
  }
  if (topNegative) {
    rationales.push(
      `${topNegative.label} drukt de score (${topNegative.score}/100).`,
    );
  }
  return rationales;
}

// ============================================================
//  Holding integration helpers
// ============================================================

/**
 * Pure helper om een `Holding` te verrijken met een `factorScore`. Muteert
 * niet; retourneert een nieuw object zodat upstream state-management
 * (Zustand, React) veilig blijft.
 */
export function applyFactorScore<T extends Holding>(
  holding: T,
  factorScore: FactorScore,
): T {
  return { ...holding, factorScore };
}

/**
 * Score een set holdings met gedeelde gewichten. De caller leunt op zijn
 * eigen data-bronnen (enrichment service, snapshots) om `inputs` te bouwen;
 * de mapping naar ticker is authoritative.
 */
export function scoreHoldings(
  holdings: Holding[],
  inputs: Map<string, FactorScoringInput>,
  weights: FactorWeights = DEFAULT_FACTOR_WEIGHTS,
): Holding[] {
  return holdings.map((holding) => {
    const input = inputs.get(holding.ticker);
    if (!input) return holding;
    return applyFactorScore(holding, scoreFactors(input, weights));
  });
}
