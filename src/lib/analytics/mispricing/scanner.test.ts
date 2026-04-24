import { describe, expect, it } from "vitest";

import type { FundamentalsSnapshot } from "@/types/factor";
import type { HistoricalPoint } from "@/types/market";

import {
  scanMispricing,
  type MispricingScanInput,
  type PeerBasketEntry,
} from "./scanner";

const NOW = "2026-04-24T00:00:00.000Z";

function history(days: number, closeAt: (i: number) => number): HistoricalPoint[] {
  const out: HistoricalPoint[] = [];
  const base = new Date("2025-01-01");
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * 24 * 3600 * 1000);
    out.push({ date: d.toISOString().slice(0, 10), close: closeAt(i) });
  }
  return out;
}

function peer(
  ticker: string,
  closeAt: (i: number) => number,
  days: number = 260,
): PeerBasketEntry {
  return { ticker, priceHistory: history(days, closeAt) };
}

function fundamentals(pe: number): FundamentalsSnapshot {
  return {
    ticker: "X",
    asOf: NOW,
    currency: "EUR",
    pe,
    source: "test",
  };
}

/** Bouw een kandidaat die valuation-gap + peer-dislocation triggert. */
function cheapLaggardEntry(overrides: Partial<MispricingScanInput> = {}): MispricingScanInput {
  const peers: PeerBasketEntry[] = Array.from({ length: 6 }, (_, i) =>
    peer(`P${i}`, (j) => 100 + (j / 260) * 10),
  );
  return {
    ticker: "LAG",
    name: "Laggard NV",
    priceHistory: history(260, (i) => 100 - (i / 260) * 20),
    fundamentals: fundamentals(12),
    benchmarkPE: 20,
    peers,
    fundamentalsStable: true,
    ...overrides,
  };
}

describe("scanMispricing — basis", () => {
  it("retourneert lege candidates bij lege universe", () => {
    const r = scanMispricing({ universe: [], config: { now: NOW } });
    expect(r.candidateCount).toBe(0);
    expect(r.candidates).toEqual([]);
    expect(r.tickersScanned).toBe(0);
  });

  it("bundelt meerdere signalen tot één kandidaat", () => {
    const r = scanMispricing({
      universe: [cheapLaggardEntry()],
      config: { now: NOW },
    });
    expect(r.candidateCount).toBe(1);
    const c = r.candidates[0]!;
    expect(c.signals.length).toBeGreaterThanOrEqual(2);
    expect(c.summary).toMatch(/\+\d+ ander/);
    expect(c.aggregateScore).toBeGreaterThan(c.signals[0]!.mispricingScore);
  });

  it("signalDistribution telt over getoonde kandidaten", () => {
    const r = scanMispricing({
      universe: [cheapLaggardEntry()],
      config: { now: NOW },
    });
    const total = Object.values(r.signalDistribution).reduce((s, n) => s + n, 0);
    expect(total).toBe(r.candidates[0]!.signals.length);
  });
});

describe("scanMispricing — filtering en sortering", () => {
  it("filtert kandidaten onder minScore", () => {
    const weak = cheapLaggardEntry({
      fundamentals: fundamentals(16), // kleinere discount
      priceHistory: history(260, (i) => 100 - (i / 260) * 6),
    });
    const r = scanMispricing({
      universe: [weak],
      config: { minScore: 80, now: NOW },
    });
    expect(r.candidateCount).toBe(0);
  });

  it("sorteert aflopend op aggregate-score", () => {
    const strong = cheapLaggardEntry({
      ticker: "STR",
      name: "Strong",
      fundamentals: fundamentals(8),
      priceHistory: history(260, (i) => 100 - (i / 260) * 30),
    });
    const mild = cheapLaggardEntry({
      ticker: "MIL",
      name: "Mild",
      fundamentals: fundamentals(14),
      priceHistory: history(260, (i) => 100 - (i / 260) * 15),
    });
    const r = scanMispricing({
      universe: [mild, strong],
      config: { now: NOW },
    });
    expect(r.candidates[0]!.ticker).toBe("STR");
  });

  it("respecteert maxCandidates", () => {
    const universe: MispricingScanInput[] = Array.from({ length: 5 }, (_, i) =>
      cheapLaggardEntry({ ticker: `T${i}`, name: `Ticker ${i}` }),
    );
    const r = scanMispricing({
      universe,
      config: { maxCandidates: 3, now: NOW },
    });
    expect(r.candidateCount).toBe(3);
  });
});

describe("scanMispricing — signal-TTL en expiry", () => {
  it("zet expiresAt = now + ttlDays × 24u op elk signaal", () => {
    const r = scanMispricing({
      universe: [cheapLaggardEntry()],
      config: { signalTtlDays: 10, now: NOW },
    });
    const c = r.candidates[0]!;
    for (const s of c.signals) {
      const expiresMs = Date.parse(s.expiresAt);
      const detectedMs = Date.parse(s.detectedAt);
      const diffDays = (expiresMs - detectedMs) / (24 * 3600 * 1000);
      expect(Math.round(diffDays)).toBe(10);
    }
  });

  it("earliestExpiresAt is de vroegste expiry over signalen", () => {
    const r = scanMispricing({
      universe: [cheapLaggardEntry()],
      config: { signalTtlDays: 30, now: NOW },
    });
    const c = r.candidates[0]!;
    const min = c.signals.map((s) => s.expiresAt).sort()[0]!;
    expect(c.earliestExpiresAt).toBe(min);
  });

  it("default TTL = 30 dagen", () => {
    const r = scanMispricing({
      universe: [cheapLaggardEntry()],
      config: { now: NOW },
    });
    expect(r.signalTtlDays).toBe(30);
  });

  it("TTL van 0 wordt geclampt naar minstens 1 dag", () => {
    const r = scanMispricing({
      universe: [cheapLaggardEntry()],
      config: { signalTtlDays: 0, now: NOW },
    });
    expect(r.signalTtlDays).toBe(1);
  });
});

describe("scanMispricing — risk-flag aggregatie", () => {
  it("bundelt unieke risk-flag codes op kandidaat-niveau", () => {
    const r = scanMispricing({
      universe: [cheapLaggardEntry()],
      config: { now: NOW },
    });
    const c = r.candidates[0]!;
    // Unieke codes → geen duplicaten
    const unique = new Set(c.riskFlagCodes);
    expect(unique.size).toBe(c.riskFlagCodes.length);
    expect(c.riskFlagCodes.length).toBeGreaterThan(0);
  });
});

describe("scanMispricing — determinisme", () => {
  it("identieke input geeft identieke output", () => {
    const input = {
      universe: [cheapLaggardEntry()],
      config: { now: NOW },
    };
    const a = scanMispricing(input);
    const b = scanMispricing(input);
    expect(a).toEqual(b);
  });
});
