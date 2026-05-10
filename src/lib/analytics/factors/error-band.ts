/**
 * Error-band-berekening voor de composite-score.
 *
 * **Probleem (Simons-laag)**: een composite van "65/100" wordt
 * gepresenteerd als puntwaarde. Maar bij thin coverage (bv. quality op
 * 50% input-completeness, value op 30%) kan diezelfde score net zo goed
 * 55 of 75 zijn — de gebruiker ziet dat onzekerheid niet.
 *
 * **Aanpak (MVP)**: simple uncertainty-propagation. We modelleren elke
 * pillar als bijdragen-met-onzekerheid waarbij de onzekerheid
 * omgekeerd evenredig is aan de coverage:
 *
 *   stdErr_pillar = base_pillar_uncertainty × (1 - coverage)
 *
 * De composite-stdErr is dan de **gewogen kwadratische combinatie**
 * (standaard error-propagatie voor onafhankelijke termen):
 *
 *   stdErr_composite² = Σ (weight_i × stdErr_pillar_i)²
 *
 * Aannames + limieten van deze MVP:
 *  - Pillars worden onafhankelijk verondersteld (in praktijk hebben ze
 *    correlatie, bv. quality + lowVol). Daarmee onderschatten we
 *    waarschijnlijk de echte stdErr lichtjes — beter dan 0.
 *  - Base-uncertainty is een handgekozen ankerwaarde (10 punten op
 *    100-schaal); een toekomstige versie zou dit empirisch kunnen
 *    bootstrap'pen uit factor-rebalance-noise. Voor M17 voldoende.
 *  - Niet-reliable pillars (coverage < drempel) tellen niet mee in de
 *    composite EN dragen daardoor ook niet bij aan de stdErr — als minder
 *    pillars meedoen, valt de stdErr proportioneel lager (door minder
 *    weights). Dit voelt counter-intuitief maar klopt met de pure
 *    formele definitie.
 *  - We clampen het resultaat op [3, 25] — de min voorkomt valse
 *    precisie ("65 ± 0"), de max voorkomt absurde "65 ± 50" bij vrijwel
 *    nul-coverage situaties (waar composite toch al naar 50 valt).
 *
 * Pure functie. Inputs deterministisch → output deterministisch.
 */

import type { FactorWeights } from "@/types/factor";

export interface PillarCoverage {
  /** Naam van de pillar — alleen voor logging/debugging. */
  key: "quality" | "value" | "momentum" | "lowVol";
  /** Coverage 0..1. */
  coverage: number;
  /** Of de pillar als reliable telt (≥ MIN_COVERAGE_FOR_COMPOSITE). */
  reliable: boolean;
}

// Onzekerheids-anker per pillar bij coverage=0. 15 punten op 100-schaal
// klinkt agressief, maar na propagatie over 4 pillars valt het bij hoge
// coverage natuurlijk terug — getuned op de Asness/Simons "factor signal
// is noisy" intuïtie + onze eigen min-coverage-floor.
const BASE_PILLAR_UNCERTAINTY = 15;
// Minimum 2: nooit "65 ± 0" — voorkomt valse zekerheid. Maximum 25: een
// thin-coverage-positie krijgt een wijde band die signaalwaarde houdt.
const MIN_STD_ERR = 2;
const MAX_STD_ERR = 25;

export interface ComputeStdErrInput {
  weights: FactorWeights;
  pillars: PillarCoverage[];
}

export function computeCompositeStdErr(input: ComputeStdErrInput): number {
  // Alleen reliable pillars dragen bij — anders zou een uitgesloten
  // pillar (die ook niet in de composite zit) toch onzekerheid toevoegen.
  const reliable = input.pillars.filter((p) => p.reliable);
  if (reliable.length === 0) {
    // Composite is dan geforceerd 50; conventionele wide-band.
    return MAX_STD_ERR;
  }

  // Renormaliseer gewichten over reliable pillars (consistent met
  // composite-berekening die dezelfde renormalisatie doet).
  const weightLookup: Record<PillarCoverage["key"], number> = {
    quality: input.weights.quality,
    value: input.weights.value,
    momentum: input.weights.momentum,
    lowVol: input.weights.lowVol,
  };
  const totalReliableWeight = reliable.reduce(
    (sum, p) => sum + (weightLookup[p.key] ?? 0),
    0,
  );
  if (totalReliableWeight === 0) return MAX_STD_ERR;

  let varianceSum = 0;
  for (const p of reliable) {
    const w = (weightLookup[p.key] ?? 0) / totalReliableWeight;
    // Onzekerheid daalt lineair met coverage; clamp op [0, 1].
    const cov = Math.max(0, Math.min(1, p.coverage));
    const stdErrPillar = BASE_PILLAR_UNCERTAINTY * (1 - cov);
    varianceSum += (w * stdErrPillar) ** 2;
  }

  const stdErr = Math.sqrt(varianceSum);
  return Math.max(MIN_STD_ERR, Math.min(MAX_STD_ERR, stdErr));
}

/**
 * Format helper voor UI: "65 ± 8" of "65" (als stdErr ontbreekt).
 * Gebruik wanneer je composite + band in één string wil tonen.
 */
export function formatCompositeWithBand(
  composite: number,
  stdErr: number | undefined,
): string {
  if (typeof stdErr !== "number" || !Number.isFinite(stdErr)) {
    return `${Math.round(composite)}`;
  }
  return `${Math.round(composite)} ± ${Math.round(stdErr)}`;
}
