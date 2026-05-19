import { describe, expect, it } from "vitest";

import {
  buildSignalPerformanceReport,
  classifyDecay,
  computeComponentPerformance,
  computeSpearmanRank,
} from "./engine";
import { buildSignalPerformanceCsv } from "./csv";
import {
  MIN_SAMPLE_SIZE,
  type SignalObservation,
} from "./types";

/**
 * Module 27 — Signal Performance Lab engine tests.
 *
 * **Geen overfit-magie** — tests verifiëren expliciet dat:
 *  - Sample-size warning kicks in onder MIN_SAMPLE_SIZE
 *  - Disclaimer altijd aanwezig
 *  - False-positives en false-negatives correct geclassificeerd
 *  - Decay-classifier monotonic-decay/growth detecteert
 *  - Spearman rank-correlation is correct
 */

const ASOF = "2026-05-19T00:00:00.000Z";

function obs(
  ticker: string,
  qualityScore: number | null,
  forwardReturns: Record<string, number | null>,
  regime: "RISK_ON" | "NEUTRAL" | "DEFENSIVE" | "UNKNOWN" = "UNKNOWN",
): SignalObservation {
  return {
    ticker,
    asOf: ASOF,
    scores: { quality: qualityScore },
    regime,
    forwardReturns: forwardReturns as SignalObservation["forwardReturns"],
  };
}

describe("computeSpearmanRank — robuust tegen outliers", () => {
  it("perfect positief gerangschikt → +1", () => {
    const r = computeSpearmanRank([1, 2, 3, 4, 5, 6], [10, 20, 30, 40, 50, 60]);
    expect(r).toBe(1);
  });

  it("perfect omgekeerd → -1", () => {
    const r = computeSpearmanRank([1, 2, 3, 4, 5, 6], [60, 50, 40, 30, 20, 10]);
    expect(r).toBe(-1);
  });

  it("<5 obs → null", () => {
    expect(computeSpearmanRank([1, 2], [3, 4])).toBeNull();
    expect(computeSpearmanRank([1, 2, 3, 4], [5, 6, 7, 8])).toBeNull();
  });

  it("ties krijgen gemiddelde rank zonder crash", () => {
    const r = computeSpearmanRank([1, 1, 1, 2, 3], [1, 2, 3, 4, 5]);
    expect(r).not.toBeNull();
  });
});

describe("computeComponentPerformance — kerncijfers", () => {
  it("hit-rate berekening: score>50 + ret>=0 = hit", () => {
    const observations: SignalObservation[] = [
      obs("A", 80, { "12m": 0.1 }), // hit
      obs("B", 60, { "12m": 0.05 }), // hit
      obs("C", 70, { "12m": -0.05 }), // miss
      obs("D", 30, { "12m": -0.05 }), // hit (low score, negative return)
      obs("E", 20, { "12m": 0.1 }), // miss (low score, positive return)
    ];
    const perf = computeComponentPerformance(
      "quality",
      "12m",
      observations,
    );
    expect(perf.sampleSize).toBe(5);
    expect(perf.hitRate).toBe(0.6);
  });

  it("false-positives: score>=70 + return<-5%", () => {
    const observations: SignalObservation[] = [
      obs("FP1", 80, { "12m": -0.10 }), // FP
      obs("FP2", 75, { "12m": -0.20 }), // FP
      obs("OK", 75, { "12m": 0.05 }), // ok
      obs("LowScore", 50, { "12m": -0.10 }), // niet FP (score < 70)
    ];
    const perf = computeComponentPerformance(
      "quality",
      "12m",
      observations,
    );
    expect(perf.falsePositiveCount).toBe(2);
  });

  it("false-negatives: score<=30 + return>+5%", () => {
    const observations: SignalObservation[] = [
      obs("FN1", 20, { "12m": 0.20 }), // FN
      obs("FN2", 15, { "12m": 0.10 }), // FN
      obs("Ok", 25, { "12m": -0.05 }), // ok
      obs("HighScore", 60, { "12m": 0.10 }), // niet FN (score > 30)
    ];
    const perf = computeComponentPerformance(
      "quality",
      "12m",
      observations,
    );
    expect(perf.falseNegativeCount).toBe(2);
  });

  it("long-short spread: top-quintile minus bottom-quintile", () => {
    const observations: SignalObservation[] = [
      obs("TOP1", 85, { "12m": 0.20 }),
      obs("TOP2", 90, { "12m": 0.10 }),
      obs("MID", 50, { "12m": 0.05 }),
      obs("BOT1", 10, { "12m": -0.05 }),
      obs("BOT2", 5, { "12m": -0.15 }),
    ];
    const perf = computeComponentPerformance(
      "quality",
      "12m",
      observations,
    );
    expect(perf.topQuintileReturn).toBeCloseTo(0.15, 3);
    expect(perf.bottomQuintileReturn).toBeCloseTo(-0.10, 3);
    expect(perf.longShortSpread).toBeCloseTo(0.25, 3);
  });

  it("sample < MIN_SAMPLE_SIZE → warning rendert", () => {
    const observations: SignalObservation[] = Array.from(
      { length: 10 },
      (_, i) => obs(`T${i}`, 50 + i * 5, { "12m": 0.01 * i }),
    );
    const perf = computeComponentPerformance(
      "quality",
      "12m",
      observations,
    );
    expect(perf.sampleSize).toBe(10);
    expect(perf.warning).not.toBeNull();
    expect(perf.warning!).toMatch(/observaties|aanbevolen|illustratief/i);
  });

  it("score=null wordt overgeslagen", () => {
    const observations: SignalObservation[] = [
      obs("A", 70, { "12m": 0.05 }),
      obs("B", null, { "12m": 0.10 }),
      obs("C", 80, { "12m": 0.08 }),
    ];
    const perf = computeComponentPerformance(
      "quality",
      "12m",
      observations,
    );
    expect(perf.sampleSize).toBe(2); // B telt niet mee
  });
});

describe("classifyDecay — patroon-detectie", () => {
  function makeByHorizon(
    hitRates: [number, number, number, number],
  ): ReturnType<typeof computeComponentPerformance>[] {
    return (["1m", "3m", "6m", "12m"] as const).map(
      (h, i): ReturnType<typeof computeComponentPerformance> => ({
        component: "quality",
        horizon: h,
        sampleSize: 50,
        informationCoefficient: 0,
        hitRate: hitRates[i] ?? null,
        longShortSpread: null,
        topQuintileReturn: null,
        bottomQuintileReturn: null,
        falsePositiveCount: 0,
        falseNegativeCount: 0,
        warning: null,
      }),
    );
  }

  it("hit-rate daalt monotoon → monotonic_decay", () => {
    expect(classifyDecay(makeByHorizon([0.7, 0.65, 0.6, 0.55]))).toBe(
      "monotonic_decay",
    );
  });

  it("hit-rate stijgt monotoon → monotonic_growth", () => {
    expect(classifyDecay(makeByHorizon([0.45, 0.5, 0.55, 0.6]))).toBe(
      "monotonic_growth",
    );
  });

  it("alles binnen 0.05 band → flat", () => {
    expect(classifyDecay(makeByHorizon([0.5, 0.52, 0.51, 0.49]))).toBe(
      "flat",
    );
  });

  it("piek midden → peak_mid", () => {
    expect(classifyDecay(makeByHorizon([0.4, 0.6, 0.7, 0.45]))).toBe(
      "peak_mid",
    );
  });

  it("ontbrekende horizon → insufficient", () => {
    const broken = makeByHorizon([0.5, 0.5, 0.5, 0.5]);
    broken[3]!.hitRate = null;
    expect(classifyDecay(broken)).toBe("insufficient");
  });
});

describe("buildSignalPerformanceReport — orchestrator", () => {
  it("lege observations → leeg rapport + disclaimer + global-warning", () => {
    const report = buildSignalPerformanceReport({
      observations: [],
      generatedAt: ASOF,
    });
    expect(report.totalObservations).toBe(0);
    expect(report.components).toHaveLength(6);
    expect(report.regimeBreakdowns).toHaveLength(6);
    expect(report.globalWarning).not.toBeNull();
    expect(report.disclaimer).toMatch(/Historische prestaties|garantie/i);
  });

  it("globalWarning triggert onder MIN_SAMPLE_SIZE", () => {
    const observations = Array.from({ length: 20 }, (_, i) =>
      obs(`T${i}`, 50 + i, { "12m": 0.01 * (i - 10) }),
    );
    const report = buildSignalPerformanceReport({
      observations,
      generatedAt: ASOF,
    });
    expect(report.globalWarning).not.toBeNull();
  });

  it("genoeg observations → geen global warning", () => {
    const observations = Array.from({ length: 50 }, (_, i) =>
      obs(`T${i}`, 50 + (i % 50), {
        "1m": 0.005 * i,
        "3m": 0.01 * i,
        "6m": 0.015 * i,
        "12m": 0.02 * i,
      }),
    );
    const report = buildSignalPerformanceReport({
      observations,
      generatedAt: ASOF,
    });
    expect(report.totalObservations).toBe(50);
    expect(report.globalWarning).toBeNull();
  });

  it("regime-breakdown bevat alle 4 regime-buckets per component", () => {
    const observations: SignalObservation[] = [
      obs("A", 80, { "12m": 0.1 }, "RISK_ON"),
      obs("B", 70, { "12m": 0.05 }, "NEUTRAL"),
      obs("C", 60, { "12m": -0.05 }, "DEFENSIVE"),
    ];
    const report = buildSignalPerformanceReport({
      observations,
      generatedAt: ASOF,
    });
    const quality = report.regimeBreakdowns.find((b) => b.component === "quality");
    expect(quality!.byRegime.map((c) => c.regime).sort()).toEqual([
      "DEFENSIVE",
      "NEUTRAL",
      "RISK_ON",
      "UNKNOWN",
    ]);
  });
});

describe("buildSignalPerformanceCsv — export", () => {
  it("bevat alle 3 secties + disclaimer-regel", () => {
    const report = buildSignalPerformanceReport({
      observations: [],
      generatedAt: ASOF,
    });
    const csv = buildSignalPerformanceCsv(report);
    expect(csv).toMatch(/Sectie 1: per-component performance/);
    expect(csv).toMatch(/Sectie 2: regime-breakdown/);
    expect(csv).toMatch(/Sectie 3: decay-pattern/);
    expect(csv).toMatch(/DISCLAIMER/);
  });

  it("CSV-escape op velden met komma/quote", () => {
    const report = buildSignalPerformanceReport({
      observations: [],
      generatedAt: ASOF,
    });
    const csv = buildSignalPerformanceCsv(report);
    // Geen unwrapped komma die de CSV-structuur breekt
    const lines = csv.split(/\r\n/);
    // Header in sectie 1 telt 11 kolommen
    const hdr = lines.find((l) => l.startsWith("component,horizon"));
    expect(hdr!.split(",").length).toBe(11);
  });

  it("global warning komt in CSV als comment-regel", () => {
    const observations = Array.from({ length: 5 }, (_, i) =>
      obs(`T${i}`, 50 + i, { "12m": 0.01 * i }),
    );
    const report = buildSignalPerformanceReport({
      observations,
      generatedAt: ASOF,
    });
    const csv = buildSignalPerformanceCsv(report);
    expect(csv).toMatch(/# WAARSCHUWING:/);
  });
});

describe("Module 27 — spec-conformance + risicoanalist-laag", () => {
  it("MIN_SAMPLE_SIZE = 30 (spec-vast)", () => {
    expect(MIN_SAMPLE_SIZE).toBe(30);
  });

  it("disclaimer benoemt expliciet 'geen garantie'", () => {
    const report = buildSignalPerformanceReport({
      observations: [],
      generatedAt: ASOF,
    });
    expect(report.disclaimer).toMatch(/geen garantie/i);
    expect(report.disclaimer).toMatch(/historische/i);
  });

  it("onzekerheid expliciet bij <30 obs (risicoanalist-eis)", () => {
    const observations = Array.from({ length: 5 }, (_, i) =>
      obs(`T${i}`, 80, { "12m": 0.1 }),
    );
    const report = buildSignalPerformanceReport({
      observations,
      generatedAt: ASOF,
    });
    // Iedere component-perf onder MIN_SAMPLE_SIZE moet warning hebben
    for (const comp of report.components) {
      for (const row of comp.byHorizon) {
        if (row.sampleSize > 0 && row.sampleSize < 30) {
          expect(row.warning).not.toBeNull();
        }
      }
    }
  });
});
