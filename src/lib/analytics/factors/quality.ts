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
 * Quality-factor: rendement op geïnvesteerd kapitaal, marges, balans-kracht
 * en cashflow-generatie. Hogere score = kwalitatief sterker bedrijf.
 *
 * Ondersteunde inputs (allemaal optioneel; ontbrekende velden worden
 * genegeerd i.p.v. de score omlaag te trekken):
 *  - ROIC, ROE
 *  - debt/equity, interest coverage
 *  - gross/operating margin
 *  - free cash flow yield
 */
export function scoreQuality(
  fundamentals: FundamentalsSnapshot | null | undefined,
): ScoreFromSignalsResult {
  if (!fundamentals) {
    return {
      score: 50,
      rationales: ["Geen fundamentals beschikbaar voor quality-score."],
      coverage: 0,
    };
  }

  const signals: FactorSignal[] = [
    buildSignal({
      key: "roic",
      label: "ROIC",
      value: fundamentals.roic,
      weight: 1.5,
      kind: "rampUp",
      min: 0.05,
      max: 0.25,
      rationale: (score, value) =>
        score >= 70
          ? `Sterke ROIC (${formatPct(value)}) — efficiënt kapitaalgebruik.`
          : score <= 30
            ? `Lage ROIC (${formatPct(value)}) — beperkte rendementsmotor.`
            : `ROIC rond gemiddelde (${formatPct(value)}).`,
    }),
    buildSignal({
      key: "roe",
      label: "ROE",
      value: fundamentals.roe,
      weight: 1,
      kind: "rampUp",
      min: 0.05,
      max: 0.3,
      rationale: (score, value) =>
        score >= 70
          ? `Hoge ROE (${formatPct(value)}).`
          : score <= 30
            ? `Zwakke ROE (${formatPct(value)}).`
            : `ROE gemiddeld (${formatPct(value)}).`,
    }),
    buildSignal({
      key: "debtToEquity",
      label: "Debt/Equity",
      value: fundamentals.debtToEquity,
      weight: 1.2,
      kind: "rampDown",
      min: 0,
      max: 2,
      rationale: (score, value) =>
        score >= 70
          ? `Solide balans (D/E ${formatRatio(value, 2)}).`
          : score <= 30
            ? `Hoge schuldenlast (D/E ${formatRatio(value, 2)}).`
            : `Matige hefboom (D/E ${formatRatio(value, 2)}).`,
    }),
    buildSignal({
      key: "fcfYield",
      label: "FCF yield",
      value: fundamentals.fcfYield,
      weight: 1.2,
      kind: "rampUp",
      min: 0,
      max: 0.1,
      rationale: (score, value) =>
        score >= 70
          ? `Sterke cashflow-generatie (${formatPct(value)} FCF yield).`
          : score <= 30
            ? `Beperkte vrije cashflow (${formatPct(value)}).`
            : `FCF yield rond het gemiddelde (${formatPct(value)}).`,
    }),
    buildSignal({
      key: "grossMargin",
      label: "Bruto marge",
      value: fundamentals.grossMargin,
      weight: 0.8,
      kind: "rampUp",
      min: 0.15,
      max: 0.6,
      rationale: (score, value) =>
        score >= 70
          ? `Sterke bruto marge (${formatPct(value)}) wijst op pricing power.`
          : score <= 30
            ? `Zwakke bruto marge (${formatPct(value)}).`
            : `Bruto marge gemiddeld (${formatPct(value)}).`,
    }),
    buildSignal({
      key: "operatingMargin",
      label: "Operationele marge",
      value: fundamentals.operatingMargin,
      weight: 1,
      kind: "rampUp",
      min: 0.05,
      max: 0.3,
      rationale: (score, value) =>
        score >= 70
          ? `Hoge operationele marge (${formatPct(value)}).`
          : score <= 30
            ? `Lage operationele marge (${formatPct(value)}).`
            : `Operationele marge gemiddeld (${formatPct(value)}).`,
    }),
    buildSignal({
      key: "interestCoverage",
      label: "Rentedekking",
      value: fundamentals.interestCoverage,
      weight: 0.6,
      kind: "rampUp",
      min: 2,
      max: 20,
      rationale: (score, value) =>
        score >= 70
          ? `Ruime rentedekking (${formatRatio(value, 1)}x).`
          : score <= 30
            ? `Krappe rentedekking (${formatRatio(value, 1)}x).`
            : `Rentedekking acceptabel (${formatRatio(value, 1)}x).`,
    }),
  ];

  return scoreFromSignals(signals);
}
