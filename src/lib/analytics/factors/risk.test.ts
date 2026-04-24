import { describe, expect, it } from "vitest";

import { scoreRisk } from "./risk";

describe("scoreRisk", () => {
  it("beloont lage vol, kleine drawdown en lage beta", () => {
    const result = scoreRisk({
      volatility: 0.12,
      maxDrawdown: -0.08,
      beta: 0.7,
    });
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it("straft hoge vol, diepe drawdown en hoge beta", () => {
    const result = scoreRisk({
      volatility: 0.55,
      maxDrawdown: -0.5,
      beta: 1.8,
    });
    expect(result.score).toBeLessThanOrEqual(25);
  });

  it("accepteert positief opgegeven drawdown-waarde", () => {
    const signed = scoreRisk({ volatility: 0.2, maxDrawdown: -0.2, beta: 1 });
    const unsigned = scoreRisk({ volatility: 0.2, maxDrawdown: 0.2, beta: 1 });
    expect(signed.score).toBe(unsigned.score);
  });

  it("leeg input → neutraal 50", () => {
    expect(scoreRisk({}).score).toBe(50);
  });
});
