import { describe, expect, it, vi } from "vitest";

import type { HistoricalPoint } from "@/types/market";

import { fetchBenchmark, resampleMonthly } from "./benchmark-fetcher";

function bench(values: number[], startDate = "2024-01-15"): HistoricalPoint[] {
  const start = new Date(startDate);
  return values.map((close, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), close };
  });
}

describe("fetchBenchmark", () => {
  it("gebruikt primary ticker bij genoeg data", async () => {
    const fetcher = vi.fn().mockResolvedValue(bench(Array.from({ length: 50 }, () => 100)));
    const r = await fetchBenchmark("MSCI_WORLD", { fetcher });
    expect(r.usedFallback).toBe(false);
    expect(r.resolvedTicker).toBe("IWDA.AS");
    expect(r.history.length).toBe(50);
  });

  it("valt terug op fallback wanneer primary leeg is", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce([]) // primary
      .mockResolvedValueOnce(bench(Array.from({ length: 60 }, () => 100))); // fallback 1
    const r = await fetchBenchmark("MSCI_WORLD", { fetcher });
    expect(r.usedFallback).toBe(true);
    expect(r.resolvedTicker).toBe("URTH");
  });

  it("warnt + lege history bij volledige uitval", async () => {
    const fetcher = vi.fn().mockResolvedValue([]);
    const r = await fetchBenchmark("SP500", { fetcher });
    expect(r.history).toEqual([]);
    expect(r.warnings.some((w) => /Geen benchmark-data/.test(w))).toBe(true);
  });

  it("fetcher-fouten worden in warnings gevangen, niet gegooid", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network"));
    const r = await fetchBenchmark("ALL_WORLD", { fetcher });
    expect(r.history).toEqual([]);
    expect(r.warnings.some((w) => /Fetch faalde/.test(w))).toBe(true);
  });
});

describe("resampleMonthly", () => {
  it("houdt de laatste handelsdag van iedere maand", () => {
    const history: HistoricalPoint[] = [
      { date: "2024-01-05", close: 100 },
      { date: "2024-01-30", close: 105 },
      { date: "2024-02-10", close: 102 },
      { date: "2024-02-28", close: 110 },
    ];
    const monthly = resampleMonthly(history);
    expect(monthly.length).toBe(2);
    expect(monthly[0]!.close).toBe(105);
    expect(monthly[1]!.close).toBe(110);
  });

  it("filtert ongeldige sluitkoersen", () => {
    const history: HistoricalPoint[] = [
      { date: "2024-01-30", close: 100 },
      { date: "2024-02-28", close: 0 },
      { date: "2024-03-31", close: 110 },
    ];
    const monthly = resampleMonthly(history);
    expect(monthly.map((p) => p.close)).toEqual([100, 110]);
  });
});
