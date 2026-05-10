/**
 * Test-fixtures voor de behavioral coach. Niet voor productie.
 */

import type {
  BehavioralDetectorInput,
  BehavioralPosition,
  BehavioralTransaction,
} from "./detector-types";

export function makeDetectorInput(
  overrides: Partial<BehavioralDetectorInput> = {},
): BehavioralDetectorInput {
  const base: BehavioralDetectorInput = {
    portfolioId: "p-1",
    asOf: "2026-05-10T12:00:00.000Z",
    baseCurrency: "EUR",
    totalValue: 100_000,
    cashBalance: 5_000,
    positionCount: 12,
    positions: makePositions(),
    sectorExposure: [
      { label: "Technology", weight: 0.30 },
      { label: "Healthcare", weight: 0.20 },
      { label: "Industrials", weight: 0.20 },
      { label: "Consumer", weight: 0.15 },
      { label: "Financials", weight: 0.15 },
    ],
    recentTransactions: [],
    profile: {
      objective: "GROWTH",
      riskTolerance: "BALANCED",
      investmentHorizonYrs: 15,
      cashBufferPct: 0.05,
      maxCashShare: 0.25,
      maxPositionWeight: 0.15,
    },
  };
  return { ...base, ...overrides };
}

export function makePositions(
  overrides: Array<Partial<BehavioralPosition>> = [],
): BehavioralPosition[] {
  const base: BehavioralPosition[] = [
    {
      ticker: "ASML",
      name: "ASML Holding",
      sector: "Technology",
      marketValueBase: 12_000,
      weight: 0.12,
      pnlPct: 0.20,
    },
    {
      ticker: "MSFT",
      name: "Microsoft",
      sector: "Technology",
      marketValueBase: 10_000,
      weight: 0.10,
      pnlPct: 0.10,
    },
    {
      ticker: "VWCE",
      name: "Vanguard FTSE All-World",
      sector: "Diversified",
      marketValueBase: 30_000,
      weight: 0.30,
      pnlPct: 0.05,
    },
  ];
  return overrides.length === 0
    ? base
    : overrides.map((o, i) => ({ ...(base[i] ?? base[0]!), ...o }));
}

export function makeTransaction(
  overrides: Partial<BehavioralTransaction> = {},
): BehavioralTransaction {
  const base: BehavioralTransaction = {
    id: "tx-1",
    type: "BUY",
    ticker: "ASML",
    executedAt: new Date("2026-05-05T10:00:00.000Z"),
    quantity: 1,
    price: 800,
    priceBefore: 750,
    priceBeforeDays: 7,
    priceBefore30d: 700,
  };
  return { ...base, ...overrides };
}
