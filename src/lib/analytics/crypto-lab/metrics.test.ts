import { describe, expect, it } from "vitest";

import { computeCryptoMetrics } from "./metrics";

/**
 * Pure-function tests voor de crypto-metrics laag. Deterministisch,
 * geen Date / market-data dependencies.
 */

function buildClosesUp(n: number, start = 10_000, dailyDrift = 0.01): number[] {
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    out.push(v);
    v *= 1 + dailyDrift;
  }
  return out;
}

function buildClosesDown(n: number, start = 10_000, dailyDrift = -0.01): number[] {
  return buildClosesUp(n, start, dailyDrift);
}

function buildVolatileCloses(n: number, start = 10_000, amplitude = 0.05): number[] {
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < n; i++) {
    out.push(v);
    const sign = i % 2 === 0 ? 1 : -1;
    v *= 1 + sign * amplitude;
  }
  return out;
}

describe("computeCryptoMetrics — shape + edge cases", () => {
  it("lege array → missing dataQuality + safe defaults", () => {
    const m = computeCryptoMetrics({ asset: "BTC", closes: [] });
    expect(m.dataQuality).toBe("missing");
    expect(m.sampleSize).toBe(0);
    expect(m.momentumScore).toBe(50);
    expect(m.return12m).toBeNull();
    expect(m.annualizedVolatility).toBeNull();
    expect(m.maxDrawdown).toBeNull();
  });

  it("1 datapunt → kan geen returns rekenen, dataQuality=low", () => {
    const m = computeCryptoMetrics({ asset: "BTC", closes: [10000] });
    expect(m.sampleSize).toBe(1);
    expect(m.dataQuality).toBe("low");
    expect(m.return12m).toBeNull();
  });

  it(">=200 datapunten → dataQuality high", () => {
    const m = computeCryptoMetrics({
      asset: "BTC",
      closes: buildClosesUp(220, 10_000, 0.005),
    });
    expect(m.dataQuality).toBe("high");
    expect(m.sampleSize).toBe(220);
  });
});

describe("computeCryptoMetrics — momentum", () => {
  it("opwaartse trend → momentum-score > 50, trendDirection up", () => {
    const m = computeCryptoMetrics({
      asset: "BTC",
      closes: buildClosesUp(252, 10_000, 0.005),
    });
    expect(m.momentumScore).toBeGreaterThan(60);
    expect(m.trendDirection).toBe("up");
    expect(m.return12m).toBeGreaterThan(0);
  });

  it("neerwaartse trend → momentum-score < 50, trendDirection down", () => {
    const m = computeCryptoMetrics({
      asset: "BTC",
      closes: buildClosesDown(252, 10_000, -0.005),
    });
    expect(m.momentumScore).toBeLessThan(40);
    expect(m.trendDirection).toBe("down");
    expect(m.return12m).toBeLessThan(0);
  });
});

describe("computeCryptoMetrics — volatiliteit & drawdown", () => {
  it("volatiele series → hogere annualizedVolatility", () => {
    const calm = computeCryptoMetrics({
      asset: "BTC",
      closes: buildClosesUp(252, 10_000, 0.001),
    });
    const wild = computeCryptoMetrics({
      asset: "BTC",
      closes: buildVolatileCloses(252, 10_000, 0.05),
    });
    expect(wild.annualizedVolatility ?? 0).toBeGreaterThan(
      calm.annualizedVolatility ?? 0,
    );
  });

  it("downtrend → maxDrawdown is sterk negatief", () => {
    const m = computeCryptoMetrics({
      asset: "BTC",
      closes: buildClosesDown(252, 10_000, -0.005),
    });
    expect(m.maxDrawdown ?? 0).toBeLessThan(-0.2);
  });

  it("monotone uptrend → maxDrawdown ≈ 0", () => {
    const m = computeCryptoMetrics({
      asset: "BTC",
      closes: buildClosesUp(252, 10_000, 0.003),
    });
    expect(m.maxDrawdown ?? -1).toBeCloseTo(0, 1);
  });
});

describe("computeCryptoMetrics — determinisme (Simons-laag)", () => {
  it("zelfde input → identieke output", () => {
    const closes = buildClosesUp(252, 10_000, 0.004);
    const a = computeCryptoMetrics({ asset: "BTC", closes });
    const b = computeCryptoMetrics({ asset: "BTC", closes });
    expect(a).toEqual(b);
  });
});
