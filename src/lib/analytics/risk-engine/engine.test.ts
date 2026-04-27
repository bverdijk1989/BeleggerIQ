import { describe, expect, it } from "vitest";

import { valueHolding } from "../valuation";
import { buildRiskReport } from "./engine";
import type { Holding } from "@/types/portfolio";

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h1",
    portfolioId: "p1",
    ticker: "ASML",
    name: "ASML",
    assetClass: "EQUITY",
    currency: "EUR",
    quantity: 10,
    avgCostPrice: 500,
    currentPrice: 600,
    sector: "Technology",
    region: "Europe",
    ...overrides,
  };
}

function valuation(h: Holding) {
  return valueHolding(h, { baseCurrency: "EUR", fxRate: 1 });
}

describe("buildRiskReport", () => {
  it("levert een lage risicoscore bij gelijk verdeelde portefeuille in base currency", () => {
    const holdings = Array.from({ length: 10 }).map((_, i) =>
      holding({
        id: `h${i}`,
        ticker: `T${i}`,
        name: `Naam ${i}`,
        sector: ["Technology", "Healthcare", "Financials", "Energy", "Consumer Staples"][i % 5]!,
        quantity: 1,
        avgCostPrice: 100,
        currentPrice: 100,
        volatility: 0.12,
      }),
    );
    const valuations = holdings.map(valuation);
    const totalValue = valuations.reduce((sum, v) => sum + v.marketValueBase, 0);

    const report = buildRiskReport({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    expect(report.positions).toHaveLength(10);
    expect(report.largestPositionWeight).toBeCloseTo(0.1, 3);
    expect(report.foreignCurrencyExposure).toBe(0);
    expect(report.riskScore).toBeLessThan(50);
    expect(report.overallSeverity).not.toBe("high");
  });

  it("geeft high severity bij single-position portefeuille in vreemde valuta", () => {
    const h = holding({ currency: "USD", quantity: 1, avgCostPrice: 100, currentPrice: 100, volatility: 0.5 });
    const valuations = [valueHolding(h, { baseCurrency: "EUR", fxRate: 0.9 })];
    const totalValue = valuations[0]!.marketValueBase;

    const report = buildRiskReport({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    expect(report.largestPositionWeight).toBeCloseTo(1, 5);
    expect(report.foreignCurrencyExposure).toBeCloseTo(1, 5);
    expect(report.overallSeverity).toBe("high");
    expect(report.flags.some((f) => f.code === "concentration.position")).toBe(true);
    expect(report.flags.some((f) => f.code === "exposure.currency")).toBe(true);
    expect(report.positions[0]?.riskClass).toBe("high");
  });

  it("flagt top-5 concentratie boven drempel", () => {
    const weights = [0.3, 0.2, 0.15, 0.12, 0.08, 0.05, 0.05, 0.05];
    const holdings = weights.map((w, i) =>
      holding({
        id: `h${i}`,
        ticker: `T${i}`,
        name: `Naam ${i}`,
        quantity: 1,
        avgCostPrice: w * 1000,
        currentPrice: w * 1000,
        sector: "Technology",
      }),
    );
    const valuations = holdings.map(valuation);
    const totalValue = valuations.reduce((sum, v) => sum + v.marketValueBase, 0);

    const report = buildRiskReport({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    const codes = report.flags.map((f) => f.code);
    expect(codes).toContain("concentration.top5");
    expect(report.top5Weight).toBeGreaterThan(0.6);
  });

  it("topSector wordt correct gevuld en concentratiewaarschuwing triggert boven drempel", () => {
    const holdings = [
      holding({ id: "h1", ticker: "A", sector: "Technology", currentPrice: 500, quantity: 1 }),
      holding({ id: "h2", ticker: "B", sector: "Technology", currentPrice: 400, quantity: 1 }),
      holding({ id: "h3", ticker: "C", sector: "Healthcare", currentPrice: 100, quantity: 1 }),
    ];
    const valuations = holdings.map(valuation);
    const totalValue = valuations.reduce((sum, v) => sum + v.marketValueBase, 0);

    const report = buildRiskReport({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    expect(report.topSector?.label).toBe("Technology");
    expect(report.flags.some((f) => f.code === "concentration.sector")).toBe(true);
  });

  it("ETF-only portefeuille triggert GEEN sector-bias-flag (regression: 'Onbekend' 100%)", () => {
    // Vanguard / iShares ETFs hebben holding.sector = null. Voorheen
    // viel dat in een "Onbekend"-bucket → 100% sector-concentratie →
    // fout-positieve concentration.sector flag.
    const etfs = [
      holding({
        id: "h1",
        ticker: "VWCE",
        name: "Vanguard FTSE All-World",
        assetClass: "ETF",
        sector: null,
        currentPrice: 100,
        quantity: 100,
      }),
      holding({
        id: "h2",
        ticker: "IWDA",
        name: "iShares MSCI World",
        assetClass: "ETF",
        sector: null,
        currentPrice: 80,
        quantity: 50,
      }),
    ];
    const valuations = etfs.map(valuation);
    const totalValue = valuations.reduce((sum, v) => sum + v.marketValueBase, 0);

    const report = buildRiskReport({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    expect(report.topSector).toBeUndefined();
    expect(report.flags.some((f) => f.code === "concentration.sector")).toBe(false);
  });

  it("EQUITY zonder sector-data telt nog wél als 'Onbekend' (data-quality-signaal)", () => {
    // Een aandeel zonder sector-info is GEEN ETF-quirk maar een
    // enrichment-gat dat de gebruiker hoort te zien.
    const holdings = [
      holding({
        id: "h1",
        ticker: "XYZ",
        assetClass: "EQUITY",
        sector: null, // missing data
        currentPrice: 500,
        quantity: 2,
      }),
    ];
    const valuations = holdings.map(valuation);
    const totalValue = valuations.reduce((sum, v) => sum + v.marketValueBase, 0);

    const report = buildRiskReport({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    expect(report.topSector?.label).toBe("Onbekend");
  });

  it("mixed ETF + single-stock: weight relatief tot total-portfolio (50% tech-stocks + 50% ETF → topSector 50%)", () => {
    const holdings = [
      holding({
        id: "h1",
        ticker: "ASML",
        sector: "Technology",
        assetClass: "EQUITY",
        currentPrice: 500,
        quantity: 1,
      }),
      holding({
        id: "h2",
        ticker: "VWCE",
        name: "Vanguard FTSE All-World",
        assetClass: "ETF",
        sector: null,
        currentPrice: 500,
        quantity: 1,
      }),
    ];
    const valuations = holdings.map(valuation);
    const totalValue = valuations.reduce((sum, v) => sum + v.marketValueBase, 0);

    const report = buildRiskReport({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations,
      totalValue,
    });

    // Sector-weight = 50%/totaal — niet 100%/equity-only.
    expect(report.topSector?.label).toBe("Technology");
    expect(report.topSector?.weight).toBeCloseTo(0.5, 2);
  });

  it("lege portefeuille retourneert neutrale score en geen warnings", () => {
    const report = buildRiskReport({
      portfolioId: "p1",
      baseCurrency: "EUR",
      valuations: [],
      totalValue: 0,
    });
    expect(report.positions).toEqual([]);
    expect(report.flags).toEqual([]);
    expect(report.concentrationHhi).toBe(0);
    expect(report.top5Weight).toBe(0);
  });
});
