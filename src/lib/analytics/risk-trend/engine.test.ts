import { describe, expect, it } from "vitest";

import {
  buildRiskTrendReport,
  buildTrendDelta,
} from "./engine";
import { buildRiskTrendSnapshot } from "./snapshot-builder";
import type { RiskTrendPoint, RiskTrendSnapshot } from "./types";

/**
 * Module 30 — Risk Trend & Snapshot History tests.
 *
 * Pure-function engine + snapshot-builder. Tests dekken:
 *  - Lege/eenpuntige timelines
 *  - Per-metric delta + direction (improving/worsening/stable/unknown)
 *  - Significance-drempels
 *  - Overall direction-aggregator
 *  - Headline / caveats
 *  - Privacy: snapshot bevat geen ticker-namen of bedragen
 */

const ASOF = "2026-05-19T00:00:00.000Z";

function snap(overrides: Partial<RiskTrendSnapshot> = {}): RiskTrendSnapshot {
  return {
    schemaVersion: 1,
    healthScore: 70,
    riskScore: 50,
    concentrationHhi: 0.15,
    largestPositionWeight: 0.1,
    top5Weight: 0.4,
    sectorHhi: 0.2,
    volatility: 0.18,
    maxDrawdown: -0.15,
    foreignCurrencyExposure: 0.3,
    dataDepthScore: 70,
    driftAvg: 0.05,
    positionCount: 10,
    ...overrides,
  };
}

function point(
  capturedAt: string,
  snapshot: RiskTrendSnapshot,
): RiskTrendPoint {
  return {
    capturedAt,
    date: capturedAt.slice(0, 10),
    snapshot,
  };
}

describe("buildRiskTrendReport — shape", () => {
  it("lege points → warning + null summary + disclaimer", () => {
    const r = buildRiskTrendReport({ generatedAt: ASOF, points: [] });
    expect(r.points).toHaveLength(0);
    expect(r.summary).toBeNull();
    expect(r.warning).toMatch(/snapshots/i);
    expect(r.disclaimer).toMatch(/spiegel|advies|garantie/i);
  });

  it("één snapshot → warning 'minimaal twee nodig'", () => {
    const r = buildRiskTrendReport({
      generatedAt: ASOF,
      points: [point("2026-04-01T00:00:00.000Z", snap())],
    });
    expect(r.summary).toBeNull();
    expect(r.warning).toMatch(/twee/i);
  });

  it("twee snapshots → summary aanwezig + periode-label", () => {
    const r = buildRiskTrendReport({
      generatedAt: ASOF,
      points: [
        point("2026-04-01T00:00:00.000Z", snap({ healthScore: 60 })),
        point("2026-05-01T00:00:00.000Z", snap({ healthScore: 75 })),
      ],
    });
    expect(r.summary).not.toBeNull();
    expect(r.summary!.periodLabel).toMatch(/vorige maand|maanden/i);
    expect(r.summary!.deltas).toHaveLength(12);
  });

  it("3+ snapshots → geen <4 warning", () => {
    const r = buildRiskTrendReport({
      generatedAt: ASOF,
      points: Array.from({ length: 6 }, (_, i) =>
        point(
          new Date(2026, 0, i + 1).toISOString(),
          snap({ healthScore: 60 + i }),
        ),
      ),
    });
    expect(r.warning).toBeNull();
  });
});

describe("buildTrendDelta — per-metric directie", () => {
  it("healthScore stijgt → improving + significant", () => {
    const d = buildTrendDelta(
      "healthScore",
      snap({ healthScore: 80 }),
      snap({ healthScore: 60 }),
    );
    expect(d.direction).toBe("improving");
    expect(d.significant).toBe(true);
    expect(d.change).toBe(20);
  });

  it("riskScore stijgt → worsening (hoger = slechter)", () => {
    const d = buildTrendDelta(
      "riskScore",
      snap({ riskScore: 70 }),
      snap({ riskScore: 50 }),
    );
    expect(d.direction).toBe("worsening");
    expect(d.significant).toBe(true);
  });

  it("concentratie HHI stijgt → worsening", () => {
    const d = buildTrendDelta(
      "concentrationHhi",
      snap({ concentrationHhi: 0.3 }),
      snap({ concentrationHhi: 0.15 }),
    );
    expect(d.direction).toBe("worsening");
  });

  it("maxDrawdown minder negatief → improving", () => {
    const d = buildTrendDelta(
      "maxDrawdown",
      snap({ maxDrawdown: -0.1 }),
      snap({ maxDrawdown: -0.25 }),
    );
    expect(d.direction).toBe("improving");
  });

  it("verandering onder significance → stable", () => {
    const d = buildTrendDelta(
      "healthScore",
      snap({ healthScore: 71 }),
      snap({ healthScore: 70 }),
    );
    expect(d.significant).toBe(false);
    expect(d.direction).toBe("stable");
  });

  it("vorige waarde null → direction unknown", () => {
    const d = buildTrendDelta(
      "dataDepthScore",
      snap({ dataDepthScore: 70 }),
      snap({ dataDepthScore: null }),
    );
    expect(d.direction).toBe("unknown");
    expect(d.change).toBeNull();
  });

  it("positionCount delta gebruikt count-unit", () => {
    const d = buildTrendDelta(
      "positionCount",
      snap({ positionCount: 15 }),
      snap({ positionCount: 10 }),
    );
    expect(d.unit).toBe("count");
    expect(d.significant).toBe(true);
  });
});

describe("Overall direction + highlights", () => {
  it("meer improving dan worsening → overallDirection=improving", () => {
    const current = snap({
      healthScore: 80,
      riskScore: 40,
      concentrationHhi: 0.1,
      dataDepthScore: 90,
    });
    const previous = snap({
      healthScore: 60,
      riskScore: 70,
      concentrationHhi: 0.3,
      dataDepthScore: 50,
    });
    const r = buildRiskTrendReport({
      generatedAt: ASOF,
      points: [
        point("2026-04-01T00:00:00.000Z", previous),
        point("2026-05-01T00:00:00.000Z", current),
      ],
    });
    expect(r.summary!.overallDirection).toBe("improving");
  });

  it("meer worsening → overallDirection=worsening", () => {
    const current = snap({
      healthScore: 50,
      riskScore: 80,
      concentrationHhi: 0.4,
      volatility: 0.35,
    });
    const previous = snap({
      healthScore: 75,
      riskScore: 40,
      concentrationHhi: 0.1,
      volatility: 0.15,
    });
    const r = buildRiskTrendReport({
      generatedAt: ASOF,
      points: [
        point("2026-04-01T00:00:00.000Z", previous),
        point("2026-05-01T00:00:00.000Z", current),
      ],
    });
    expect(r.summary!.overallDirection).toBe("worsening");
  });

  it("highlights gecapt op 3", () => {
    const current = snap({
      healthScore: 80,
      riskScore: 80,
      concentrationHhi: 0.4,
      volatility: 0.35,
      dataDepthScore: 30,
    });
    const previous = snap({
      healthScore: 60,
      riskScore: 50,
      concentrationHhi: 0.1,
      volatility: 0.15,
      dataDepthScore: 80,
    });
    const r = buildRiskTrendReport({
      generatedAt: ASOF,
      points: [
        point("2026-04-01T00:00:00.000Z", previous),
        point("2026-05-01T00:00:00.000Z", current),
      ],
    });
    expect(r.summary!.highlights.length).toBeLessThanOrEqual(3);
  });

  it("geen significante changes → 'nauwelijks veranderd' headline", () => {
    const r = buildRiskTrendReport({
      generatedAt: ASOF,
      points: [
        point("2026-04-01T00:00:00.000Z", snap()),
        point("2026-05-01T00:00:00.000Z", snap({ healthScore: 71 })),
      ],
    });
    expect(r.summary!.headline.toLowerCase()).toMatch(/nauwelijks|stabiel/);
  });
});

describe("buildRiskTrendSnapshot — privacy + minimal-fields", () => {
  /**
   * Mock minimale PortfolioView. We casten naar `any` om type-clutter te
   * vermijden; in productie levert `buildPortfolioView` 'em volledig.
   */
  function viewStub() {
    return {
      summary: { positionCount: 5 },
      health: { score: 72 },
      risk: {
        riskScore: 45,
        concentrationHhi: 0.18,
        largestPositionWeight: 0.12,
        top5Weight: 0.55,
        sectorConcentrationHhi: 0.25,
        portfolioVolatility: 0.2,
        maxDrawdown: -0.18,
        foreignCurrencyExposure: 0.35,
      },
      rebalance: {
        recommendations: [
          { targetWeight: 0.1, currentWeight: 0.08 },
          { targetWeight: 0.2, currentWeight: 0.25 },
        ],
      },
    };
  }

  it("snapshot bevat alleen geaggregeerde fields — geen tickers/namen", () => {
    const s = buildRiskTrendSnapshot({
      view: viewStub() as never,
      dataDepthScore: 80,
    });
    const json = JSON.stringify(s);
    // Geen ticker-strings, geen bedragen-velden
    expect(json).not.toMatch(/ticker|name|amount/i);
    // Alle waarden zijn nummers, null of "schemaVersion"
    for (const [k, v] of Object.entries(s)) {
      if (k === "schemaVersion") {
        expect(v).toBe(1);
      } else {
        expect(["number", "object"]).toContain(typeof v);
      }
    }
  });

  it("JSON-payload is compact (< 350 bytes)", () => {
    const s = buildRiskTrendSnapshot({
      view: viewStub() as never,
      dataDepthScore: 80,
    });
    const bytes = Buffer.byteLength(JSON.stringify(s), "utf-8");
    expect(bytes).toBeLessThan(350);
  });

  it("driftAvg berekend uit rebalance-recommendations", () => {
    const s = buildRiskTrendSnapshot({
      view: viewStub() as never,
    });
    // |0.08 - 0.10| + |0.25 - 0.20| = 0.02 + 0.05 = 0.07
    // avg = 0.07 / 2 = 0.035
    expect(s.driftAvg).toBeCloseTo(0.035, 3);
  });

  it("driftAvg = null bij geen rebalance-rows", () => {
    const v = viewStub();
    v.rebalance.recommendations = [];
    const s = buildRiskTrendSnapshot({ view: v as never });
    expect(s.driftAvg).toBeNull();
  });

  it("waarden zijn afgerond — geen ruwe floats", () => {
    const s = buildRiskTrendSnapshot({
      view: viewStub() as never,
      dataDepthScore: 80,
    });
    // Health-score op 1 decimaal
    if (s.healthScore !== null) {
      expect(s.healthScore.toString().split(".")[1]?.length ?? 0).toBeLessThanOrEqual(1);
    }
    // Fracties op 4 decimalen
    if (s.concentrationHhi !== null) {
      expect(
        s.concentrationHhi.toString().split(".")[1]?.length ?? 0,
      ).toBeLessThanOrEqual(4);
    }
  });
});

describe("Module 30 — spec-conformance + caveats", () => {
  it("Disclaimer noemt 'spiegel' en 'geen voorspelling'", () => {
    const r = buildRiskTrendReport({ generatedAt: ASOF, points: [] });
    expect(r.disclaimer).toMatch(/spiegel/i);
    expect(r.disclaimer).toMatch(/voorspelling/i);
  });

  it("drawdown-verbetering levert caveat over 'kortere window'", () => {
    const current = snap({ maxDrawdown: -0.05 });
    const previous = snap({ maxDrawdown: -0.25 });
    const r = buildRiskTrendReport({
      generatedAt: ASOF,
      points: [
        point("2026-04-01T00:00:00.000Z", previous),
        point("2026-05-01T00:00:00.000Z", current),
      ],
    });
    expect(
      r.summary!.caveats.some((c) => /window|crash|garantie/i.test(c)),
    ).toBe(true);
  });

  it("≥4 ontbrekende metrics → caveat over datadekking", () => {
    const current = snap({
      healthScore: null,
      riskScore: null,
      concentrationHhi: null,
      dataDepthScore: null,
    });
    const r = buildRiskTrendReport({
      generatedAt: ASOF,
      points: [
        point("2026-04-01T00:00:00.000Z", snap()),
        point("2026-05-01T00:00:00.000Z", current),
      ],
    });
    expect(
      r.summary!.caveats.some((c) => /metrics|datadekking|incompleet/i.test(c)),
    ).toBe(true);
  });

  it("alle 12 trend-metrics zijn aanwezig in delta-array", () => {
    const r = buildRiskTrendReport({
      generatedAt: ASOF,
      points: [
        point("2026-04-01T00:00:00.000Z", snap()),
        point("2026-05-01T00:00:00.000Z", snap({ healthScore: 75 })),
      ],
    });
    const keys = r.summary!.deltas.map((d) => d.key).sort();
    expect(keys).toEqual(
      [
        "concentrationHhi",
        "dataDepthScore",
        "driftAvg",
        "foreignCurrencyExposure",
        "healthScore",
        "largestPositionWeight",
        "maxDrawdown",
        "positionCount",
        "riskScore",
        "sectorHhi",
        "top5Weight",
        "volatility",
      ].sort(),
    );
  });
});
