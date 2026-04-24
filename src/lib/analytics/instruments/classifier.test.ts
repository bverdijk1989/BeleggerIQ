import { describe, expect, it } from "vitest";

import type { EnrichedInstrument } from "@/lib/data/instrument-enrichment";
import type { Holding } from "@/types/portfolio";

import { classifyInstrument, classifyInstruments } from "./classifier";

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h1",
    portfolioId: "p1",
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    assetClass: "EQUITY",
    currency: "USD",
    quantity: 10,
    avgCostPrice: 500,
    currentPrice: 600,
    isin: null,
    sector: null,
    region: null,
    metadata: null,
    ...overrides,
  };
}

function makeEnrichment(
  overrides: Partial<EnrichedInstrument> = {},
): EnrichedInstrument {
  return {
    ticker: "NVDA",
    normalizedTicker: "NVDA",
    isin: null,
    name: "NVIDIA Corporation",
    assetClass: "EQUITY",
    quoteType: "EQUITY",
    exchange: "NMS",
    currency: "USD",
    sector: "Technology",
    industry: "Semiconductors",
    country: "United States",
    region: "North America",
    confidence: 0.9,
    sources: ["input", "yahoo-search", "yahoo-profile"],
    warnings: [],
    enrichedAt: "2026-04-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("classifyInstrument — single stocks", () => {
  it("EQUITY zonder enrichment → SINGLE_STOCK met MEDIUM confidence", () => {
    const r = classifyInstrument({
      holding: makeHolding(),
      enrichment: null,
    });
    expect(r.instrumentType).toBe("SINGLE_STOCK");
    expect(r.confidence).toBe("MEDIUM");
    expect(r.metadata.supportsFactorScoring).toBe(true);
    expect(r.metadata.eligibleForWinnerRule).toBe(true);
  });

  it("EQUITY mét enrichment → HIGH confidence + sectorFocus", () => {
    const r = classifyInstrument({
      holding: makeHolding(),
      enrichment: makeEnrichment(),
    });
    expect(r.instrumentType).toBe("SINGLE_STOCK");
    expect(r.confidence).toBe("HIGH");
    expect(r.metadata.sectorFocus).toBe("Technology");
  });
});

describe("classifyInstrument — ETF-subtypes", () => {
  it("IWDA (MSCI World) → BROAD_MARKET_ETF", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "IWDA.AS",
        name: "iShares Core MSCI World UCITS ETF",
        assetClass: "ETF",
        currency: "EUR",
      }),
      enrichment: makeEnrichment({
        assetClass: "ETF",
        quoteType: "ETF",
        sector: null,
        region: "Europe",
      }),
    });
    expect(r.instrumentType).toBe("BROAD_MARKET_ETF");
    expect(r.metadata.isBroadMarket).toBe(true);
    expect(r.metadata.eligibleForWinnerRule).toBe(true);
    expect(r.metadata.supportsFactorScoring).toBe(false);
  });

  it("JEPI → INCOME_ETF met covered-call strategie", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "JEPI",
        name: "JPMorgan Equity Premium Income ETF JEPI",
        assetClass: "ETF",
      }),
      enrichment: makeEnrichment({ assetClass: "ETF", quoteType: "ETF" }),
    });
    expect(r.instrumentType).toBe("INCOME_ETF");
    expect(r.metadata.isIncomeFocused).toBe(true);
    expect(r.metadata.incomeStrategy).toBe("covered-call");
    expect(r.metadata.eligibleForWinnerRule).toBe(false);
  });

  it("Sector-ETF → SECTOR_ETF, niet eligible for winner rule", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "XLK",
        name: "Technology Select Sector SPDR",
        assetClass: "ETF",
      }),
      enrichment: makeEnrichment({ assetClass: "ETF", quoteType: "ETF" }),
    });
    expect(r.instrumentType).toBe("SECTOR_ETF");
    expect(r.metadata.sectorFocus).toBe("Technology");
    expect(r.metadata.eligibleForWinnerRule).toBe(false);
  });

  it("Bond ETF → BOND_ETF met income-flag", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "AGG",
        name: "iShares Core US Aggregate Bond ETF",
        assetClass: "ETF",
      }),
      enrichment: makeEnrichment({ assetClass: "ETF", quoteType: "ETF" }),
    });
    expect(r.instrumentType).toBe("BOND_ETF");
    expect(r.metadata.isIncomeFocused).toBe(true);
    expect(r.metadata.incomeStrategy).toBe("bond-heavy");
  });

  it("Theme ETF → THEME_ETF markeert speculatief", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "BOTZ",
        name: "Global X Robotics & AI ETF",
        assetClass: "ETF",
      }),
      enrichment: makeEnrichment({ assetClass: "ETF", quoteType: "ETF" }),
    });
    expect(r.instrumentType).toBe("THEME_ETF");
    expect(r.metadata.isSpeculative).toBe(true);
  });

  it("Biotech ETF → SECTOR_ETF (Healthcare), niet theme", () => {
    // GICS sub-sector onder Healthcare; niet thematisch.
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "IBB",
        name: "iShares Biotechnology ETF",
        assetClass: "ETF",
      }),
    });
    expect(r.instrumentType).toBe("SECTOR_ETF");
    expect(r.metadata.sectorFocus).toBe("Healthcare");
  });

  it("Leveraged ETF → LEVERAGED_OR_INVERSE + speculatief", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "TQQQ",
        name: "ProShares UltraPro QQQ 3x",
        assetClass: "ETF",
      }),
      enrichment: makeEnrichment({ assetClass: "ETF", quoteType: "ETF" }),
    });
    expect(r.instrumentType).toBe("LEVERAGED_OR_INVERSE");
    expect(r.metadata.isSpeculative).toBe(true);
    expect(r.metadata.eligibleForWinnerRule).toBe(false);
  });

  it("Onbekende ETF-naam → UNKNOWN_ETF + LOW confidence", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "XXX",
        name: "Obscure Strategy Fund XYZ",
        assetClass: "ETF",
      }),
      enrichment: null,
    });
    expect(r.instrumentType).toBe("UNKNOWN_ETF");
    expect(r.confidence).toBe("LOW");
    expect(r.metadata.supportsFactorScoring).toBe(false);
  });
});

describe("classifyInstrument — cash, crypto, speculative", () => {
  it("CASH assetClass → CASH type, income-focused", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "CASH",
        name: "Cash Balance",
        assetClass: "CASH",
      }),
    });
    expect(r.instrumentType).toBe("CASH");
    expect(r.confidence).toBe("HIGH");
    expect(r.metadata.isIncomeFocused).toBe(true);
  });

  it("Money-market naam-keyword → CASH zelfs zonder expliciete assetClass", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        name: "BNP Paribas Money Market Fund",
        assetClass: "OTHER",
      }),
    });
    expect(r.instrumentType).toBe("CASH");
  });

  it("CRYPTO → speculatief", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "BTC",
        name: "Bitcoin",
        assetClass: "CRYPTO",
      }),
    });
    expect(r.instrumentType).toBe("CRYPTO");
    expect(r.metadata.isSpeculative).toBe(true);
  });
});

describe("classifyInstrument — REIT, BOND, COMMODITY single positions", () => {
  it("REIT behandeld als SINGLE_STOCK met real-estate focus", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "O",
        name: "Realty Income Corp",
        assetClass: "REIT",
      }),
    });
    expect(r.instrumentType).toBe("SINGLE_STOCK");
    expect(r.metadata.sectorFocus).toBe("Real Estate");
    expect(r.metadata.isIncomeFocused).toBe(true);
  });

  it("BOND → BOND_ETF equivalent voor engines", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "NL0000102275",
        name: "Dutch Government Bond 2030",
        assetClass: "BOND",
      }),
    });
    expect(r.instrumentType).toBe("BOND_ETF");
    expect(r.metadata.incomeStrategy).toBe("bond-heavy");
  });

  it("COMMODITY → COMMODITY_ETF", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "XAU",
        name: "Gold spot",
        assetClass: "COMMODITY",
      }),
    });
    expect(r.instrumentType).toBe("COMMODITY_ETF");
  });
});

describe("classifyInstrument — unknown fallback", () => {
  it("OTHER zonder hints → UNKNOWN met LOW confidence", () => {
    const r = classifyInstrument({
      holding: makeHolding({
        ticker: "XX",
        name: "Mystery Thing",
        assetClass: "OTHER",
      }),
    });
    expect(r.instrumentType).toBe("UNKNOWN");
    expect(r.confidence).toBe("LOW");
  });
});

describe("classifyInstruments (bulk)", () => {
  it("retourneert Map met per-ticker classificaties", () => {
    const map = classifyInstruments({
      items: [
        { holding: makeHolding({ ticker: "NVDA", assetClass: "EQUITY" }) },
        {
          holding: makeHolding({
            ticker: "IWDA.AS",
            name: "iShares Core MSCI World UCITS ETF",
            assetClass: "ETF",
          }),
        },
      ],
    });
    expect(map.size).toBe(2);
    expect(map.get("NVDA")?.instrumentType).toBe("SINGLE_STOCK");
    expect(map.get("IWDA.AS")?.instrumentType).toBe("BROAD_MARKET_ETF");
  });
});
