import type { FundamentalsSnapshot } from "@/types/factor";

import {
  buildSignal,
  formatPct,
  formatRatio,
  scoreFromSignals,
  type FactorSignal,
  type ScoreFromSignalsResult,
} from "./shared";

/**
 * Value-factor: hoe aantrekkelijk geprijsd is de onderneming t.o.v. winst,
 * cashflow, omzet en eigen vermogen. Een PEG-signaal wordt afgeleid uit
 * (P/E) / (eps-groei in %) wanneer beide beschikbaar zijn.
 *
 * Hogere score = goedkoper / betere value propositie.
 */
export function scoreValue(
  fundamentals: FundamentalsSnapshot | null | undefined,
): ScoreFromSignalsResult {
  if (!fundamentals) {
    return {
      score: 50,
      rationales: ["Geen fundamentals beschikbaar voor value-score."],
      coverage: 0,
    };
  }

  const peg = derivePeg(fundamentals);

  const signals: FactorSignal[] = [
    buildSignal({
      key: "pe",
      label: "P/E",
      value: fundamentals.pe,
      weight: 1.4,
      kind: "rampDown",
      min: 8,
      max: 40,
      rationale: (score, value) =>
        score >= 70
          ? `Aantrekkelijke P/E (${formatRatio(value, 1)}).`
          : score <= 30
            ? `Hoge P/E (${formatRatio(value, 1)}) — premie-waardering.`
            : `P/E marktconform (${formatRatio(value, 1)}).`,
    }),
    buildSignal({
      key: "peg",
      label: "PEG",
      value: peg,
      weight: 1,
      kind: "rampDown",
      min: 0.5,
      max: 3,
      rationale: (score, value) =>
        score >= 70
          ? `Sterke PEG (${formatRatio(value, 2)}) — groei ingeprijsd met korting.`
          : score <= 30
            ? `Zwakke PEG (${formatRatio(value, 2)}) — groei te duur betaald.`
            : `PEG rond marktgemiddelde (${formatRatio(value, 2)}).`,
    }),
    buildSignal({
      key: "evEbitda",
      label: "EV/EBITDA",
      value: fundamentals.evEbitda,
      weight: 1.2,
      kind: "rampDown",
      min: 5,
      max: 30,
      rationale: (score, value) =>
        score >= 70
          ? `Lage EV/EBITDA (${formatRatio(value, 1)}).`
          : score <= 30
            ? `Hoge EV/EBITDA (${formatRatio(value, 1)}).`
            : `EV/EBITDA rond gemiddelde (${formatRatio(value, 1)}).`,
    }),
    buildSignal({
      key: "pb",
      label: "P/B",
      value: fundamentals.pb,
      weight: 0.8,
      kind: "rampDown",
      min: 0.8,
      max: 8,
      rationale: (score, value) =>
        score >= 70
          ? `Lage P/B (${formatRatio(value, 2)}).`
          : score <= 30
            ? `Hoge P/B (${formatRatio(value, 2)}).`
            : `P/B gemiddeld (${formatRatio(value, 2)}).`,
    }),
    buildSignal({
      key: "ps",
      label: "P/S",
      value: fundamentals.ps,
      weight: 0.6,
      kind: "rampDown",
      min: 0.5,
      max: 10,
      rationale: (score, value) =>
        score >= 70
          ? `Lage P/S (${formatRatio(value, 2)}).`
          : score <= 30
            ? `Hoge P/S (${formatRatio(value, 2)}).`
            : `P/S marktconform (${formatRatio(value, 2)}).`,
    }),
    buildSignal({
      key: "fcfYield",
      label: "FCF yield",
      value: fundamentals.fcfYield,
      weight: 1,
      kind: "rampUp",
      min: 0.02,
      max: 0.12,
      rationale: (score, value) =>
        score >= 70
          ? `Aantrekkelijke FCF yield (${formatPct(value)}).`
          : score <= 30
            ? `Lage FCF yield (${formatPct(value)}).`
            : `FCF yield rond gemiddelde (${formatPct(value)}).`,
    }),
    buildSignal({
      key: "dividendYield",
      label: "Dividendrendement",
      value: fundamentals.dividendYield,
      weight: 0.5,
      kind: "rampUp",
      min: 0,
      max: 0.05,
      rationale: (score, value) =>
        score >= 70
          ? `Aantrekkelijk dividend (${formatPct(value)}).`
          : score <= 30
            ? `Beperkt dividend (${formatPct(value)}).`
            : `Dividend rond gemiddelde (${formatPct(value)}).`,
    }),
  ];

  return scoreFromSignals(signals);
}

/**
 * Leidt PEG (P/E gedeeld door eps-groei in %) af wanneer beide beschikbaar zijn.
 * Bij zeer lage of negatieve groei is PEG weinig informatief; we skippen dan.
 */
function derivePeg(fundamentals: FundamentalsSnapshot): number | null {
  const growth =
    fundamentals.epsGrowth5y ?? fundamentals.revenueGrowth5y ?? null;
  if (
    fundamentals.pe === undefined ||
    growth === null ||
    growth === undefined ||
    growth <= 0.02
  ) {
    return null;
  }
  return fundamentals.pe / (growth * 100);
}
