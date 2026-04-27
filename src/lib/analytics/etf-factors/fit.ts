import type { InvestmentObjective } from "@/types/profile";

import {
  scoreFromSignals,
  type FactorSignal,
  type ScoreFromSignalsResult,
} from "../factors/shared";

import {
  isDistributionPolicyAligned,
  type EtfMetadata,
} from "./metadata";

/**
 * Fit-factor — pasvorm met user-objective + portefeuille-spreiding.
 *
 * Drie signalen:
 *  1. **Distribution policy** matcht objective?
 *     INCOME/RETIREMENT → distributing voorkeur.
 *     GROWTH/FIRE/CAPITAL_PRESERVATION/BALANCED → accumulating voorkeur.
 *  2. **Sector-concentratie** binnen het fonds zelf — een ETF met
 *     `topSectorWeight ≥ 0.6` is feitelijk een sector-ETF; voor
 *     core-allocatie minder geschikt. Lager = beter (rampDown).
 *  3. **Replicatie-methode** — physical scoort hoger dan synthetic
 *     (counterparty-risico).
 *
 * Wanneer geen van de drie velden beschikbaar is → coverage 0; engine
 * laat fit-pillar uit composite weg.
 */
export function scoreEtfFit(
  meta: EtfMetadata | null,
  objective: InvestmentObjective | null | undefined,
): ScoreFromSignalsResult {
  if (!meta) {
    return {
      score: 50,
      rationales: ["Geen fund-metadata — pasvorm-score op neutraal."],
      coverage: 0,
    };
  }

  const signals: FactorSignal[] = [];

  // 1. Distribution-policy fit.
  const policyAligned = isDistributionPolicyAligned(
    meta.distributionPolicy,
    objective,
  );
  if (policyAligned !== null) {
    const score = policyAligned ? 90 : 35;
    const policyLabel =
      meta.distributionPolicy === "ACCUMULATING"
        ? "accumulerend"
        : "uitkerend";
    const objLabel = objective ? `${objective.toLowerCase()}` : "doel";
    signals.push({
      key: "distribution",
      label: "Distributie-policy",
      value: policyAligned ? 1 : 0,
      weight: 1,
      score,
      rationale: policyAligned
        ? `Beleid is ${policyLabel} — past bij ${objLabel}-doel.`
        : `Beleid is ${policyLabel} — minder geschikt voor ${objLabel}-doel.`,
    });
  }

  // 2. Internal sector-concentratie (lower = better core fit).
  if (
    typeof meta.topSectorWeight === "number" &&
    Number.isFinite(meta.topSectorWeight)
  ) {
    const w = meta.topSectorWeight;
    let s: number;
    if (w <= 0.20) s = 90;
    else if (w >= 0.60) s = 25;
    else s = Math.round(90 - ((w - 0.20) / 0.40) * 65);
    signals.push({
      key: "sectorConcentration",
      label: "Sector-spreiding binnen het fonds",
      value: w,
      weight: 1,
      score: s,
      rationale:
        w <= 0.25
          ? "Breed gespreid — goede core-allocatie."
          : w >= 0.50
            ? `Sector-zwaartepunt ${meta.topSector ?? "concentratie"} (${pct(w)}) — meer een sector-bet dan een core-ETF.`
            : `Lichte sector-tilt (${pct(w)}).`,
    });
  }

  // 3. Replicatie-methode.
  if (
    typeof meta.replicationMethod === "string" &&
    meta.replicationMethod !== "UNKNOWN"
  ) {
    const map: Record<string, number> = {
      PHYSICAL_FULL: 85,
      PHYSICAL_SAMPLED: 70,
      SYNTHETIC: 45,
    };
    const s = map[meta.replicationMethod] ?? 50;
    signals.push({
      key: "replication",
      label: "Replicatie-methode",
      value: 1,
      weight: 0.7,
      score: s,
      rationale:
        meta.replicationMethod === "SYNTHETIC"
          ? "Synthetische replicatie (swap) — counterparty-risico op de tegenpartij."
          : "Fysieke replicatie — directe blootstelling, geen swap-risico.",
    });
  }

  return scoreFromSignals(signals);
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
