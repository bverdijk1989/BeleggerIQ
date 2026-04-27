import {
  buildSignal,
  formatPct,
  scoreFromSignals,
  type FactorSignal,
  type ScoreFromSignalsResult,
} from "../factors/shared";

import type { EtfMetadata } from "./metadata";

/**
 * Track-record-factor — leeftijd + tracking-error.
 *
 * Leeftijd-rationale:
 *  - < 1 jaar → 15 (te kort om robuust te beoordelen).
 *  - 1-3 jaar → 45.
 *  - 3-5 jaar → 70.
 *  - ≥ 5 jaar → 90.
 *
 * Tracking-error (jaarlijks):
 *  - ≤ 0.10% → 90 (goed gerepliceerd)
 *  - ≥ 1.00% → 10 (slechte replicatie)
 *
 * `now` kan worden geïnjecteerd voor deterministische tests.
 */
export function scoreEtfTrackRecord(
  meta: EtfMetadata | null,
  options: { now?: Date } = {},
): ScoreFromSignalsResult {
  if (!meta) {
    return {
      score: 50,
      rationales: ["Geen fund-metadata — track-record-score op neutraal."],
      coverage: 0,
    };
  }

  const now = options.now ?? new Date();
  const ageYears =
    typeof meta.inceptionDate === "string" && meta.inceptionDate.length > 0
      ? yearsBetween(now, new Date(meta.inceptionDate))
      : null;

  const signals: FactorSignal[] = [
    buildSignal({
      key: "age",
      label: "Track-record (jaren)",
      value: ageYears,
      weight: 1,
      kind: "rampUp",
      min: 1,
      max: 7,
      rationale: (score, value) =>
        score >= 70
          ? `${value.toFixed(1)} jaar track-record — ruim genoeg voor beoordeling.`
          : score <= 30
            ? `${value.toFixed(1)} jaar track-record — te kort voor robuuste oordeling.`
            : `${value.toFixed(1)} jaar track-record — beoordeling indicatief.`,
    }),
    buildSignal({
      key: "trackingError",
      label: "Tracking-error",
      value: meta.trackingErrorYearly,
      weight: 1.2,
      kind: "rampDown",
      min: 0.001, // 0.10%
      max: 0.01, // 1.00%
      rationale: (score, value) =>
        score >= 70
          ? `Tracking-error ${formatPct(value, 2)} — replicatie volgt benchmark netjes.`
          : score <= 30
            ? `Tracking-error ${formatPct(value, 2)} — slechte replicatie t.o.v. benchmark.`
            : `Tracking-error ${formatPct(value, 2)} — gemiddeld.`,
    }),
  ];

  return scoreFromSignals(signals);
}

function yearsBetween(later: Date, earlier: Date): number | null {
  const t1 = later.getTime();
  const t0 = earlier.getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t0)) return null;
  if (t1 <= t0) return 0;
  return (t1 - t0) / (365.25 * 24 * 60 * 60 * 1000);
}
