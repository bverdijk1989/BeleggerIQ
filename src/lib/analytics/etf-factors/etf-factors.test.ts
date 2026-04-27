import { describe, expect, it } from "vitest";

import { scoreEtfCost } from "./cost";
import { scoreEtfFit } from "./fit";
import { scoreEtfScale } from "./scale";
import { scoreEtfTrackRecord } from "./track-record";
import {
  scoreEtfFactors,
  DEFAULT_ETF_WEIGHTS,
} from "./composite";
import type { EtfMetadata } from "./metadata";
import { isDistributionPolicyAligned } from "./metadata";

const NOW = new Date("2026-04-27T00:00:00.000Z");

function meta(overrides: Partial<EtfMetadata> = {}): EtfMetadata {
  return {
    ticker: "VWCE",
    asOf: NOW.toISOString(),
    ter: 0.0022,
    spreadBps: 8,
    aum: 12_000_000_000,
    currency: "EUR",
    inceptionDate: "2019-07-23",
    trackingErrorYearly: 0.0008,
    distributionPolicy: "ACCUMULATING",
    replicationMethod: "PHYSICAL_FULL",
    topRegionWeight: 0.62,
    topRegion: "North America",
    topSectorWeight: 0.22,
    topSector: "Technology",
    ...overrides,
  };
}

// ============================================================
//  Cost-pillar
// ============================================================

describe("scoreEtfCost", () => {
  it("lage TER (0.07%) scoort hoog", () => {
    const r = scoreEtfCost(meta({ ter: 0.0007, spreadBps: 5 }));
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.coverage).toBeGreaterThanOrEqual(0.5);
  });

  it("hoge TER (0.65%) scoort laag", () => {
    const r = scoreEtfCost(meta({ ter: 0.0065, spreadBps: 30 }));
    expect(r.score).toBeLessThanOrEqual(35);
  });

  it("ontbrekende metadata → coverage 0, neutrale score", () => {
    const r = scoreEtfCost(null);
    expect(r.coverage).toBe(0);
    expect(r.score).toBe(50);
  });

  it("ontbrekende TER én spread → coverage 0", () => {
    const r = scoreEtfCost(meta({ ter: undefined, spreadBps: undefined }));
    expect(r.coverage).toBe(0);
  });
});

// ============================================================
//  Scale-pillar
// ============================================================

describe("scoreEtfScale", () => {
  it("blockbuster ETF (€12B AUM) scoort hoog", () => {
    const r = scoreEtfScale(meta({ aum: 12_000_000_000 }));
    expect(r.score).toBeGreaterThanOrEqual(85);
  });

  it("kleine ETF (€20M AUM, sluitingsrisico) scoort laag", () => {
    const r = scoreEtfScale(meta({ aum: 20_000_000 }));
    expect(r.score).toBeLessThanOrEqual(15);
  });

  it("ontbrekende AUM → coverage 0", () => {
    const r = scoreEtfScale(meta({ aum: undefined }));
    expect(r.coverage).toBe(0);
  });
});

// ============================================================
//  Track-record-pillar
// ============================================================

describe("scoreEtfTrackRecord", () => {
  it("oud fonds (10 jaar) + lage tracking-error scoort hoog", () => {
    const r = scoreEtfTrackRecord(
      meta({ inceptionDate: "2016-01-01", trackingErrorYearly: 0.0006 }),
      { now: NOW },
    );
    expect(r.score).toBeGreaterThanOrEqual(80);
  });

  it("jong fonds (6 maanden) scoort laag", () => {
    const r = scoreEtfTrackRecord(
      meta({ inceptionDate: "2025-10-27", trackingErrorYearly: 0.0006 }),
      { now: NOW },
    );
    expect(r.score).toBeLessThan(60);
  });

  it("hoge tracking-error trekt score omlaag", () => {
    const r = scoreEtfTrackRecord(
      meta({ inceptionDate: "2018-01-01", trackingErrorYearly: 0.012 }),
      { now: NOW },
    );
    expect(r.score).toBeLessThan(60);
  });
});

// ============================================================
//  Fit-pillar
// ============================================================

describe("scoreEtfFit", () => {
  it("INCOME-doel + DISTRIBUTING ETF → goede pasvorm", () => {
    const r = scoreEtfFit(
      meta({ distributionPolicy: "DISTRIBUTING", topSectorWeight: 0.18 }),
      "INCOME",
    );
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it("GROWTH-doel + ACCUMULATING ETF → goede pasvorm", () => {
    const r = scoreEtfFit(
      meta({ distributionPolicy: "ACCUMULATING" }),
      "GROWTH",
    );
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it("INCOME-doel + ACCUMULATING ETF → mismatch → lagere score", () => {
    const r = scoreEtfFit(
      meta({ distributionPolicy: "ACCUMULATING" }),
      "INCOME",
    );
    expect(r.score).toBeLessThan(70);
  });

  it("hoge sector-concentratie binnen het fonds (60% tech) → score zakt", () => {
    const r = scoreEtfFit(
      meta({
        topSectorWeight: 0.60,
        topSector: "Technology",
        distributionPolicy: "ACCUMULATING",
      }),
      "GROWTH",
    );
    expect(r.score).toBeLessThan(70);
  });

  it("synthetische replicatie → lagere fit-score dan physical", () => {
    const synthetic = scoreEtfFit(
      meta({ replicationMethod: "SYNTHETIC" }),
      "GROWTH",
    );
    const physical = scoreEtfFit(
      meta({ replicationMethod: "PHYSICAL_FULL" }),
      "GROWTH",
    );
    expect(physical.score).toBeGreaterThan(synthetic.score);
  });
});

// ============================================================
//  isDistributionPolicyAligned helper
// ============================================================

describe("isDistributionPolicyAligned", () => {
  it("INCOME → DISTRIBUTING is aligned", () => {
    expect(isDistributionPolicyAligned("DISTRIBUTING", "INCOME")).toBe(true);
  });
  it("GROWTH → ACCUMULATING is aligned", () => {
    expect(isDistributionPolicyAligned("ACCUMULATING", "GROWTH")).toBe(true);
  });
  it("RETIREMENT → ACCUMULATING is mismatch", () => {
    expect(isDistributionPolicyAligned("ACCUMULATING", "RETIREMENT")).toBe(false);
  });
  it("undefined policy → null", () => {
    expect(isDistributionPolicyAligned(undefined, "GROWTH")).toBe(null);
  });
  it("null objective → null", () => {
    expect(isDistributionPolicyAligned("ACCUMULATING", null)).toBe(null);
  });
});

// ============================================================
//  Composite (orchestrator)
// ============================================================

describe("scoreEtfFactors", () => {
  it("levert FactorScore met kind='ETF' en etfBreakdown", () => {
    const score = scoreEtfFactors({
      ticker: "VWCE",
      metadata: meta(),
      objective: "GROWTH",
      now: NOW,
    });
    expect(score.kind).toBe("ETF");
    expect(score.etfBreakdown).toBeDefined();
    expect(score.etfBreakdown!.cost).toBeGreaterThanOrEqual(60);
    expect(score.etfBreakdown!.scale).toBeGreaterThanOrEqual(80);
    expect(score.model).toBe("beleggeriq.etf.v1");
  });

  it("VWCE-achtige low-cost-broad-market ETF → composite ≥ 70", () => {
    const score = scoreEtfFactors({
      ticker: "VWCE",
      metadata: meta(),
      objective: "GROWTH",
      now: NOW,
    });
    expect(score.composite).toBeGreaterThanOrEqual(70);
  });

  it("expensive-thematic ETF → composite ≤ 50", () => {
    const score = scoreEtfFactors({
      ticker: "ARKK",
      metadata: meta({
        ter: 0.0075,
        aum: 80_000_000,
        inceptionDate: "2024-12-01",
        trackingErrorYearly: 0.012,
        distributionPolicy: "ACCUMULATING",
        replicationMethod: "PHYSICAL_SAMPLED",
        topSectorWeight: 0.62,
        topSector: "Technology",
      }),
      objective: "GROWTH",
      now: NOW,
    });
    expect(score.composite).toBeLessThanOrEqual(50);
  });

  it("compleet null metadata → composite 50, confidence ≤ 0.3", () => {
    const score = scoreEtfFactors({
      ticker: "UNKNOWN",
      metadata: null,
      objective: "GROWTH",
      now: NOW,
    });
    expect(score.composite).toBe(50);
    expect(score.confidence).toBeLessThanOrEqual(0.3);
    expect(
      score.rationales?.composite?.join(" ").toLowerCase(),
    ).toContain("onvoldoende");
  });

  it("verzint geen fundamentals — 'roic' / 'pe' komen niet voor in rationales", () => {
    const score = scoreEtfFactors({
      ticker: "VWCE",
      metadata: meta(),
      objective: "GROWTH",
      now: NOW,
    });
    const allRationales = [
      ...(score.rationales?.quality ?? []),
      ...(score.rationales?.value ?? []),
      ...(score.rationales?.momentum ?? []),
      ...(score.rationales?.lowVol ?? []),
      ...(score.rationales?.composite ?? []),
    ]
      .join(" ")
      .toLowerCase();
    expect(allRationales).not.toContain("roic");
    expect(allRationales).not.toContain("p/e");
    expect(allRationales).not.toContain("fcf");
  });

  it("respecteert custom weights", () => {
    const heavyCost = scoreEtfFactors(
      {
        ticker: "VWCE",
        metadata: meta({ ter: 0.0007 }),
        objective: "GROWTH",
        now: NOW,
      },
      { quality: 0.85, value: 0.05, momentum: 0.05, lowVol: 0.05 },
    );
    // Met TER 0.07% domineert kosten-pillar; composite trekt richting 90.
    expect(heavyCost.composite).toBeGreaterThanOrEqual(80);
  });

  it("DEFAULT_ETF_WEIGHTS som = 1.0", () => {
    const total =
      DEFAULT_ETF_WEIGHTS.quality +
      DEFAULT_ETF_WEIGHTS.value +
      DEFAULT_ETF_WEIGHTS.momentum +
      DEFAULT_ETF_WEIGHTS.lowVol;
    expect(total).toBeCloseTo(1.0, 5);
  });

  it("determinisme: identieke input → identieke output", () => {
    const a = scoreEtfFactors({
      ticker: "VWCE",
      metadata: meta(),
      objective: "GROWTH",
      now: NOW,
    });
    const b = scoreEtfFactors({
      ticker: "VWCE",
      metadata: meta(),
      objective: "GROWTH",
      now: NOW,
    });
    expect(a).toEqual(b);
  });
});
