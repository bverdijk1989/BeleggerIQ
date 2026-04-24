import { describe, expect, it } from "vitest";

import type { HistoricalPoint } from "@/types/market";

import {
  detectPeerDislocation,
  type PeerBasketEntry,
} from "./peer-dislocation";

const NOW = "2026-04-24T00:00:00.000Z";

/** Bouw een ascending daily-history waarbij `closeAt(i)` de close per index geeft. */
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

describe("detectPeerDislocation — happy paths", () => {
  it("triggert wanneer subject 12m -20% doet en peers +10%", () => {
    const subjectH = history(260, (i) => 100 - (i / 260) * 20); // -20%
    const peers: PeerBasketEntry[] = [
      peer("P1", (i) => 100 + (i / 260) * 10),
      peer("P2", (i) => 100 + (i / 260) * 12),
      peer("P3", (i) => 100 + (i / 260) * 8),
      peer("P4", (i) => 100 + (i / 260) * 11),
      peer("P5", (i) => 100 + (i / 260) * 10),
      peer("P6", (i) => 100 + (i / 260) * 13),
    ];
    const sig = detectPeerDislocation({
      ticker: "X",
      priceHistory: subjectH,
      peers,
      fundamentalsStable: true,
      now: NOW,
    });
    expect(sig).not.toBeNull();
    expect(sig!.type).toBe("peer-dislocation");
    expect(sig!.mispricingScore).toBeGreaterThan(0);
    expect(sig!.expectedHoldingPeriodDays).toBe(180);
    expect(sig!.confidence).toBeGreaterThanOrEqual(0.7); // stable + >= 6 peers
  });

  it("sterker bij diepere achterstand", () => {
    const peers: PeerBasketEntry[] = Array.from({ length: 6 }, (_, i) =>
      peer(`P${i}`, (j) => 100 + (j / 260) * 10),
    );
    const mild = detectPeerDislocation({
      ticker: "X",
      priceHistory: history(260, (i) => 100 - (i / 260) * 5), // -5%, -15% excess
      peers,
      fundamentalsStable: true,
      now: NOW,
    })!;
    const severe = detectPeerDislocation({
      ticker: "X",
      priceHistory: history(260, (i) => 100 - (i / 260) * 30), // -30%, -40% excess
      peers,
      fundamentalsStable: true,
      now: NOW,
    })!;
    expect(severe.mispricingScore).toBeGreaterThan(mild.mispricingScore);
  });
});

describe("detectPeerDislocation — null-paden", () => {
  it("null als subject niet genoeg achterloopt", () => {
    const peers: PeerBasketEntry[] = Array.from({ length: 6 }, (_, i) =>
      peer(`P${i}`, (j) => 100 + (j / 260) * 5),
    );
    const sig = detectPeerDislocation({
      ticker: "X",
      priceHistory: history(260, (i) => 100 + (i / 260) * 2), // +2% vs +5% peer
      peers,
      now: NOW,
    });
    expect(sig).toBeNull();
  });

  it("null bij < 3 valide peers", () => {
    const peers: PeerBasketEntry[] = [
      peer("P1", (i) => 100 + (i / 260) * 10),
      peer("P2", (i) => 100 + (i / 260) * 10),
    ];
    const sig = detectPeerDislocation({
      ticker: "X",
      priceHistory: history(260, (i) => 100 - (i / 260) * 20),
      peers,
      now: NOW,
    });
    expect(sig).toBeNull();
  });

  it("null bij te weinig history", () => {
    const peers: PeerBasketEntry[] = Array.from({ length: 6 }, (_, i) =>
      peer(`P${i}`, (j) => 100 + (j / 260) * 10),
    );
    const sig = detectPeerDislocation({
      ticker: "X",
      priceHistory: history(100, (i) => 100 - i),
      peers,
      now: NOW,
    });
    expect(sig).toBeNull();
  });
});

describe("detectPeerDislocation — risk-flags", () => {
  it("thin-peer-basket flag bij n=3 peers", () => {
    const peers: PeerBasketEntry[] = [
      peer("P1", (i) => 100 + (i / 260) * 10),
      peer("P2", (i) => 100 + (i / 260) * 12),
      peer("P3", (i) => 100 + (i / 260) * 8),
    ];
    const sig = detectPeerDislocation({
      ticker: "X",
      priceHistory: history(260, (i) => 100 - (i / 260) * 20),
      peers,
      fundamentalsStable: true,
      now: NOW,
    })!;
    expect(sig.riskFlags.map((f) => f.code)).toContain("thin-peer-basket");
  });

  it("earnings-deterioration-unknown flag als fundamentalsStable niet is opgegeven", () => {
    const peers: PeerBasketEntry[] = Array.from({ length: 6 }, (_, i) =>
      peer(`P${i}`, (j) => 100 + (j / 260) * 10),
    );
    const sig = detectPeerDislocation({
      ticker: "X",
      priceHistory: history(260, (i) => 100 - (i / 260) * 20),
      peers,
      now: NOW,
    })!;
    expect(sig.riskFlags.map((f) => f.code)).toContain(
      "earnings-deterioration-unknown",
    );
  });
});
