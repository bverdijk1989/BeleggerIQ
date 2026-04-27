import {
  buildSignal,
  formatPct,
  scoreFromSignals,
  type FactorSignal,
  type ScoreFromSignalsResult,
} from "../factors/shared";

import type { EtfMetadata } from "./metadata";

/**
 * Cost-factor — TER + bid/ask-spread.
 *
 * Lager = beter. Een S&P-500 tracker met TER 0.07% scoort 95+; een
 * thematische ETF met TER 0.65% komt uit op ~25.
 *
 * Drempels (industrieel:
 *  - TER ≤ 0.10% → 95
 *  - TER ≥ 0.75% → 5
 *  - linear ramp daartussen.
 *  - Spread ≤ 5 bps → 90; ≥ 50 bps → 10.
 */
export function scoreEtfCost(meta: EtfMetadata | null): ScoreFromSignalsResult {
  if (!meta) {
    return {
      score: 50,
      rationales: ["Geen fund-metadata — kosten-score op neutraal."],
      coverage: 0,
    };
  }

  const signals: FactorSignal[] = [
    buildSignal({
      key: "ter",
      label: "Total Expense Ratio",
      value: meta.ter,
      weight: 1.4,
      kind: "rampDown",
      min: 0.001, // 0.10% — uitstekende cost-floor
      max: 0.0075, // 0.75% — duurste mainstream-grens
      rationale: (score, value) =>
        score >= 70
          ? `Lage TER (${formatPct(value, 2)}) — kostenefficient.`
          : score <= 30
            ? `Hoge TER (${formatPct(value, 2)}) — drukt rendement structureel.`
            : `TER ${formatPct(value, 2)} — gemiddeld.`,
    }),
    buildSignal({
      key: "spread",
      label: "Bid/ask-spread",
      value:
        typeof meta.spreadBps === "number" ? meta.spreadBps / 10_000 : null,
      weight: 0.6,
      kind: "rampDown",
      min: 0.0005, // 5 bps
      max: 0.005, // 50 bps
      rationale: (score, value) =>
        score >= 70
          ? `Krappe spread (${formatPct(value, 2)}) — goed verhandelbaar.`
          : score <= 30
            ? `Brede spread (${formatPct(value, 2)}) — minder liquide.`
            : `Spread ${formatPct(value, 2)} — gemiddeld.`,
    }),
  ];

  return scoreFromSignals(signals);
}
