import { describe, expect, it } from "vitest";

import type { FundamentalsSnapshot } from "@/types/factor";
import type { Quote } from "@/types/market";
import type { WatchlistItem } from "@/types/watchlist";

import { evaluateHuntingList } from "./engine";
import { computeExpiresAt } from "./expiry";
import type { HuntingHistoryEntry } from "./types";

const NOW = "2026-04-25T00:00:00.000Z";

function item(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    id: overrides.id ?? "w1",
    userId: overrides.userId ?? "u1",
    ticker: overrides.ticker ?? "AAPL",
    name: overrides.name ?? "Apple",
    note: overrides.note ?? null,
    targetPrice: overrides.targetPrice ?? null,
    targetPriceHigh: overrides.targetPriceHigh ?? null,
    buyZoneTolerance: overrides.buyZoneTolerance ?? null,
    valuationMaxPE: overrides.valuationMaxPE ?? null,
    valuationMinFcfYield: overrides.valuationMinFcfYield ?? null,
    addedAt: overrides.addedAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-24T00:00:00.000Z",
  };
}

function quote(price: number | null): Quote | null {
  if (price === null) return null;
  return {
    ticker: "AAPL",
    price,
    currency: "USD",
    asOf: NOW,
  };
}

function fundamentals(
  overrides: Partial<FundamentalsSnapshot> = {},
): FundamentalsSnapshot {
  return {
    ticker: "AAPL",
    asOf: NOW,
    currency: "USD",
    source: "test",
    ...overrides,
  };
}

describe("evaluateHuntingList — status-afleiding", () => {
  it("'watching' wanneer geen triggers + geen history", () => {
    const r = evaluateHuntingList({
      entries: [
        {
          item: item({ targetPrice: 100 }),
          quote: quote(150),
          fundamentals: null,
          history: [],
        },
      ],
      config: { now: NOW },
    });
    expect(r.items[0]!.status).toBe("watching");
    expect(r.items[0]!.severity).toBe("NONE");
  });

  it("'signal-active' bij HIGH target-zone-hit", () => {
    const r = evaluateHuntingList({
      entries: [
        {
          item: item({ targetPrice: 100 }),
          quote: quote(95),
          fundamentals: null,
          history: [],
        },
      ],
      config: { now: NOW },
    });
    expect(r.items[0]!.status).toBe("signal-active");
    expect(r.items[0]!.severity).toBe("HIGH");
  });

  it("'near-target' bij LOW target-zone-near", () => {
    const r = evaluateHuntingList({
      entries: [
        {
          item: item({ targetPrice: 100, buyZoneTolerance: 0.05 }),
          quote: quote(104),
          fundamentals: null,
          history: [],
        },
      ],
      config: { now: NOW },
    });
    expect(r.items[0]!.status).toBe("near-target");
    expect(r.items[0]!.severity).toBe("LOW");
  });

  it("'signal-active' bij valuation-band + geen target-zone", () => {
    const r = evaluateHuntingList({
      entries: [
        {
          item: item({ valuationMaxPE: 15 }),
          quote: null,
          fundamentals: fundamentals({ pe: 12 }),
          history: [],
        },
      ],
      config: { now: NOW },
    });
    expect(r.items[0]!.status).toBe("signal-active");
  });

  it("'expired' wanneer history bestaat maar geen actieve trigger", () => {
    const history: HuntingHistoryEntry[] = [
      {
        firedAt: "2026-03-01T00:00:00.000Z",
        triggerType: "target-zone-reached",
        severity: "HIGH",
        price: 95,
        note: null,
      },
    ];
    const r = evaluateHuntingList({
      entries: [
        {
          item: item({ targetPrice: 100 }),
          quote: quote(150),
          fundamentals: null,
          history,
        },
      ],
      config: { now: NOW },
    });
    expect(r.items[0]!.status).toBe("expired");
  });
});

describe("evaluateHuntingList — triggers en history", () => {
  it("geeft beide triggers wanneer target + valuation afvuren", () => {
    const r = evaluateHuntingList({
      entries: [
        {
          item: item({
            targetPrice: 100,
            valuationMaxPE: 15,
            valuationMinFcfYield: 0.05,
          }),
          quote: quote(95),
          fundamentals: fundamentals({ pe: 12, fcfYield: 0.07 }),
          history: [],
        },
      ],
      config: { now: NOW },
    });
    const i = r.items[0]!;
    expect(i.triggers.length).toBe(2);
    expect(i.triggers.map((t) => t.type).sort()).toEqual([
      "target-zone-reached",
      "valuation-band-reached",
    ]);
    expect(i.severity).toBe("HIGH");
  });

  it("verlopen triggers worden in de lijst achteraan geplaatst", () => {
    // Trigger die al verlopen zou zijn als we 'now' opschuiven.
    const past = "2026-03-01T00:00:00.000Z";
    const r = evaluateHuntingList({
      entries: [
        {
          item: item({ targetPrice: 100 }),
          quote: quote(95),
          fundamentals: null,
          history: [],
        },
      ],
      config: { now: past, targetSignalTtlDays: 7 },
    });
    // Deze run fires the trigger with firedAt=past + 7d expiry; dat is
    // nog in het verleden t.o.v. een latere scanmoment:
    const laterScan = "2026-04-10T00:00:00.000Z";
    const r2 = evaluateHuntingList({
      entries: [
        {
          item: item({ targetPrice: 100 }),
          quote: quote(150), // nu boven target → geen nieuwe trigger
          fundamentals: null,
          history: r.items[0]!.triggers.map((t) => ({
            firedAt: t.firedAt,
            triggerType: t.type,
            severity: t.severity,
            price: t.snapshot.price,
            note: null,
          })),
        },
      ],
      config: { now: laterScan },
    });
    expect(r2.items[0]!.status).toBe("expired");
  });
});

describe("evaluateHuntingList — data-quality warnings", () => {
  it("warnt bij ontbrekende quote", () => {
    const r = evaluateHuntingList({
      entries: [
        {
          item: item({ targetPrice: 100 }),
          quote: null,
          fundamentals: null,
          history: [],
        },
      ],
      config: { now: NOW },
    });
    const i = r.items[0]!;
    expect(i.dataQuality.hasQuote).toBe(false);
    expect(i.dataQuality.warnings.some((w) => /koers/i.test(w))).toBe(true);
  });

  it("warnt bij valuation-band zonder fundamentals", () => {
    const r = evaluateHuntingList({
      entries: [
        {
          item: item({ valuationMaxPE: 15 }),
          quote: quote(100),
          fundamentals: null,
          history: [],
        },
      ],
      config: { now: NOW },
    });
    const i = r.items[0]!;
    expect(i.dataQuality.warnings.some((w) => /fundamentals/i.test(w))).toBe(
      true,
    );
  });

  it("warnt bij geen enkele config", () => {
    const r = evaluateHuntingList({
      entries: [
        {
          item: item(),
          quote: quote(100),
          fundamentals: null,
          history: [],
        },
      ],
      config: { now: NOW },
    });
    const i = r.items[0]!;
    expect(i.dataQuality.warnings.some((w) => /target-zone/i.test(w))).toBe(
      true,
    );
  });
});

describe("evaluateHuntingList — distributies en sortering", () => {
  it("telt status, severity en trigger-distributies", () => {
    const r = evaluateHuntingList({
      entries: [
        {
          item: item({ id: "a", ticker: "A", targetPrice: 100 }),
          quote: quote(95),
          fundamentals: null,
          history: [],
        },
        {
          item: item({ id: "b", ticker: "B", targetPrice: 100 }),
          quote: quote(150),
          fundamentals: null,
          history: [],
        },
      ],
      config: { now: NOW },
    });
    expect(r.statusDistribution["signal-active"]).toBe(1);
    expect(r.statusDistribution["watching"]).toBe(1);
    expect(r.severityDistribution["HIGH"]).toBe(1);
    expect(r.severityDistribution["NONE"]).toBe(1);
    expect(r.triggerDistribution["target-zone-reached"]).toBe(1);
  });

  it("sorteert items op severity desc", () => {
    const r = evaluateHuntingList({
      entries: [
        {
          item: item({ id: "a", ticker: "A" }),
          quote: quote(100),
          fundamentals: null,
          history: [],
        },
        {
          item: item({ id: "b", ticker: "B", targetPrice: 100 }),
          quote: quote(95),
          fundamentals: null,
          history: [],
        },
      ],
      config: { now: NOW },
    });
    expect(r.items[0]!.ticker).toBe("B"); // HIGH eerst
    expect(r.items[1]!.ticker).toBe("A");
  });
});

describe("evaluateHuntingList — determinisme", () => {
  it("zelfde input geeft zelfde output", () => {
    const input = {
      entries: [
        {
          item: item({
            targetPrice: 100,
            valuationMaxPE: 15,
          }),
          quote: quote(95),
          fundamentals: fundamentals({ pe: 13 }),
          history: [],
        },
      ],
      config: { now: NOW },
    };
    const a = evaluateHuntingList(input);
    const b = evaluateHuntingList(input);
    expect(a).toEqual(b);
  });
});

describe("expiry helper", () => {
  it("computeExpiresAt telt dagen op", () => {
    const exp = computeExpiresAt(NOW, 14);
    const diffDays =
      (Date.parse(exp) - Date.parse(NOW)) / (24 * 3600 * 1000);
    expect(Math.round(diffDays)).toBe(14);
  });
});
