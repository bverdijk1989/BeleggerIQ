import { describe, expect, it } from "vitest";

import { buildDividendOverview, type DividendInputRow } from "./dividend-overview";

const D = (iso: string) => new Date(iso);

function div(
  id: string,
  iso: string,
  isin: string | null,
  amount: number,
  currency = "USD",
): DividendInputRow {
  return {
    id,
    type: "DIVIDEND",
    isin,
    ticker: null,
    signedAmount: amount,
    currency,
    executedAt: D(iso),
  };
}

function tax(
  id: string,
  iso: string,
  isin: string | null,
  amount: number,
  currency = "USD",
): DividendInputRow {
  return {
    id,
    type: "TAX",
    isin,
    ticker: null,
    signedAmount: -Math.abs(amount), // tax komt negatief uit broker-feed
    currency,
    executedAt: D(iso),
  };
}

describe("buildDividendOverview", () => {
  it("US-dividend met 15% withheld → reclaimable = 0 (treaty al toegepast)", () => {
    const r = buildDividendOverview({
      rows: [
        div("d1", "2026-02-01", "US0378331005", 100, "USD"),
        tax("t1", "2026-02-01", "US0378331005", 15, "USD"),
      ],
    });
    expect(r).toHaveLength(1);
    const usBucket = r[0]!.byCountry.find((c) => c.countryCode === "US");
    expect(usBucket?.gross).toBe(100);
    expect(usBucket?.withheld).toBe(15);
    // 15 - (100 × 0.15) = 0
    expect(usBucket?.reclaimable).toBe(0);
  });

  it("US-dividend met 30% withheld (geen W-8BEN) → reclaimable = 15", () => {
    const r = buildDividendOverview({
      rows: [
        div("d1", "2026-02-01", "US0378331005", 100, "USD"),
        tax("t1", "2026-02-01", "US0378331005", 30, "USD"),
      ],
    });
    const us = r[0]!.byCountry[0]!;
    expect(us.withheld).toBe(30);
    // 30 - (100 × 0.15) = 15
    expect(us.reclaimable).toBe(15);
  });

  it("DE-bron 26.375% → reclaimable = ~11.375 op 100 EUR", () => {
    const r = buildDividendOverview({
      rows: [
        div("d1", "2026-04-01", "DE000BASF111", 100, "EUR"),
        tax("t1", "2026-04-01", "DE000BASF111", 26.375, "EUR"),
      ],
    });
    const de = r[0]!.byCountry[0]!;
    expect(de.countryCode).toBe("DE");
    expect(de.reclaimable).toBeCloseTo(11.375, 3);
  });

  it("multi-country jaartotalen — same currency → totals OK", () => {
    const r = buildDividendOverview({
      rows: [
        div("d1", "2026-02-01", "US0378331005", 100, "USD"),
        tax("t1", "2026-02-01", "US0378331005", 15, "USD"),
        div("d2", "2026-03-01", "US5949181045", 50, "USD"),
        tax("t2", "2026-03-01", "US5949181045", 7.5, "USD"),
      ],
    });
    const yb = r[0]!;
    expect(yb.totals.gross).toBe(150);
    expect(yb.totals.withheld).toBe(22.5);
    expect(yb.totals.currency).toBe("USD");
  });

  it("multi-currency jaar → totals=0 (currency=null) — UI moet per-rij optellen", () => {
    const r = buildDividendOverview({
      rows: [
        div("d1", "2026-02-01", "US0378331005", 100, "USD"),
        tax("t1", "2026-02-01", "US0378331005", 15, "USD"),
        div("d2", "2026-03-01", "DE000BASF111", 50, "EUR"),
      ],
    });
    expect(r[0]!.totals.currency).toBeNull();
    expect(r[0]!.byCountry).toHaveLength(2);
  });

  it("dividend zonder matchende tax → withheld=0, reclaimable=0", () => {
    const r = buildDividendOverview({
      rows: [div("d1", "2026-02-01", "GB00BLNDB000", 50, "GBP")],
    });
    const gb = r[0]!.byCountry.find((c) => c.countryCode === "GB");
    expect(gb?.gross).toBe(50);
    expect(gb?.withheld).toBe(0);
    expect(gb?.reclaimable).toBe(0);
  });

  it("foreign withholding totaals — som over alle landen × jaren", () => {
    const r = buildDividendOverview({
      rows: [
        div("d1", "2025-02-01", "US0378331005", 80, "USD"),
        tax("t1", "2025-02-01", "US0378331005", 12, "USD"),
        div("d2", "2026-02-01", "US0378331005", 100, "USD"),
        tax("t2", "2026-02-01", "US0378331005", 15, "USD"),
      ],
    });
    const totalAcrossYears = r.reduce((s, y) => s + y.totals.withheld, 0);
    expect(totalAcrossYears).toBe(27);
  });

  it("rijen gesorteerd op year desc", () => {
    const r = buildDividendOverview({
      rows: [
        div("a", "2024-02-01", "US0378331005", 80, "USD"),
        div("b", "2026-02-01", "US0378331005", 100, "USD"),
        div("c", "2025-02-01", "US0378331005", 90, "USD"),
      ],
    });
    expect(r.map((y) => y.year)).toEqual([2026, 2025, 2024]);
  });
});
