import {
  buildSignal,
  scoreFromSignals,
  type FactorSignal,
  type ScoreFromSignalsResult,
} from "../factors/shared";

import type { EtfMetadata } from "./metadata";

/**
 * Scale-factor — AUM (assets under management).
 *
 * Reden om dit als pillar te scoren:
 *  - Een ETF onder ~50M EUR riskeert sluiting / squeeze-out — operationeel
 *    risico voor lange-termijn-beleggers.
 *  - Een fonds boven 1B EUR is "core" — hoge liquiditeit, brede market-
 *    making, lagere effectieve spread.
 *
 * Drempels:
 *  - ≤ 25M     → 5  (sluitingsrisico)
 *  - 25M-100M → 30 (klein, kwetsbaar)
 *  - 100M-500M → 60 (matig)
 *  - 500M-2B  → 80 (gezond)
 *  - ≥ 2B     → 95 (core/blockbuster)
 */
export function scoreEtfScale(meta: EtfMetadata | null): ScoreFromSignalsResult {
  if (!meta) {
    return {
      score: 50,
      rationales: ["Geen fund-metadata — schaal-score op neutraal."],
      coverage: 0,
    };
  }

  if (typeof meta.aum !== "number" || !Number.isFinite(meta.aum)) {
    return {
      score: 50,
      rationales: ["AUM ontbreekt in fund-metadata."],
      coverage: 0,
    };
  }

  const signals: FactorSignal[] = [
    buildSignal({
      key: "aum",
      label: "Fund-omvang (AUM)",
      value: meta.aum,
      weight: 1,
      kind: "rampUp",
      min: 25_000_000, // 25M = sluitingsrisico
      max: 2_000_000_000, // 2B = blockbuster
      rationale: (score, value) =>
        score >= 70
          ? `AUM €${formatBigEur(value)} — ruimschoots boven sluitingsrisico-drempel.`
          : score <= 30
            ? `AUM €${formatBigEur(value)} — beperkt; risico op fund-sluiting bij verdere uitstroom.`
            : `AUM €${formatBigEur(value)} — gemiddeld.`,
    }),
  ];

  return scoreFromSignals(signals);
}

function formatBigEur(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(0)}M`;
  }
  return `${value.toFixed(0)}`;
}
