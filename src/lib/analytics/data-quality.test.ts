import { describe, expect, it } from "vitest";

import type { EnrichedInstrument } from "@/lib/data/instrument-enrichment";
import type { Holding } from "@/types/portfolio";

import {
  SEVERITY_LABELS,
  assessHoldingQuality,
  assessPortfolioQuality,
  portfolioQualityVerdict,
} from "./data-quality";

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
    sector: null,
    region: null,
    isin: null,
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
    isin: "US67066G1040",
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

describe("assessHoldingQuality", () => {
  it("volledig record → severity 'ok' en completeness 1", () => {
    const q = assessHoldingQuality({
      holding: makeHolding({ isin: "US67066G1040", sector: "Technology", region: "North America" }),
      enrichment: makeEnrichment(),
      weight: 0.1,
    });
    expect(q.severity).toBe("ok");
    expect(q.completeness).toBe(1);
    expect(q.missing).toEqual([]);
    expect(q.confidence).toBe(0.9);
  });

  it("EQUITY zonder sector → 'sector' in missing + notitie", () => {
    const q = assessHoldingQuality({
      holding: makeHolding({ isin: "US67066G1040" }),
      enrichment: makeEnrichment({ sector: null, industry: null }),
      weight: 0.05,
    });
    expect(q.missing).toContain("sector");
    expect(q.missing).toContain("industry");
    expect(q.notes.some((n) => n.toLowerCase().includes("sector"))).toBe(true);
  });

  it("ETF zonder sector is NIET missing (verwacht gedrag voor fondsen)", () => {
    const q = assessHoldingQuality({
      holding: makeHolding({
        ticker: "VUSA.AS",
        name: "Vanguard S&P 500 UCITS ETF",
        assetClass: "ETF",
        isin: "IE00B3XXRP09",
      }),
      enrichment: makeEnrichment({
        ticker: "VUSA.AS",
        normalizedTicker: "VUSA.AS",
        assetClass: "ETF",
        sector: null,
        industry: null,
        country: null,
        region: "Europe",
      }),
      weight: 0.25,
    });
    expect(q.missing).not.toContain("sector");
    expect(q.missing).not.toContain("industry");
    expect(q.severity).toBe("ok");
  });

  it("geen enrichment-record → completeness gebaseerd op Holding + notitie", () => {
    const q = assessHoldingQuality({
      holding: makeHolding(),
      enrichment: null,
      weight: 0.1,
    });
    expect(q.confidence).toBe(0);
    expect(q.notes.some((n) => /geen enrichment/i.test(n))).toBe(true);
    expect(q.completeness).toBeLessThan(0.85);
  });

  it("weight wordt geclamped naar [0..1]", () => {
    const q1 = assessHoldingQuality({
      holding: makeHolding(),
      enrichment: null,
      weight: 5,
    });
    expect(q1.weight).toBe(1);
    const q2 = assessHoldingQuality({
      holding: makeHolding(),
      enrichment: null,
      weight: -0.3,
    });
    expect(q2.weight).toBe(0);
  });

  it("severity thresholds: ok ≥ 0.85, minor ≥ 0.5, major < 0.5", () => {
    // Construeer holdings met exacte missing-count voor elk niveau.
    const full = makeHolding({
      isin: "US1",
      sector: "Tech",
      region: "North America",
    });
    const partial = makeHolding({
      isin: "US1",
      sector: null,
      region: null,
    });
    const empty = makeHolding({
      isin: null,
      sector: null,
      region: null,
      currency: null as unknown as Holding["currency"],
    });

    expect(
      assessHoldingQuality({
        holding: full,
        enrichment: makeEnrichment(),
        weight: 0,
      }).severity,
    ).toBe("ok");
    expect(
      assessHoldingQuality({
        holding: partial,
        enrichment: makeEnrichment({
          sector: null,
          industry: null,
          country: null,
        }),
        weight: 0,
      }).severity,
    ).toBe("minor");
    expect(
      assessHoldingQuality({
        holding: empty,
        enrichment: null,
        weight: 0,
      }).severity,
    ).toBe("major");
  });
});

describe("assessPortfolioQuality", () => {
  it("overallScore is weight-gewogen gemiddelde van completeness", () => {
    const report = assessPortfolioQuality({
      holdings: [
        {
          holding: makeHolding({
            id: "a",
            ticker: "NVDA",
            isin: "US1",
            sector: "Tech",
            region: "North America",
          }),
          enrichment: makeEnrichment(),
          weight: 0.8,
        },
        {
          holding: makeHolding({
            id: "b",
            ticker: "NOINFO",
            isin: null,
            sector: null,
            region: null,
          }),
          enrichment: null,
          weight: 0.2,
        },
      ],
    });
    // 0.8 * 1.0 + 0.2 * <something low> ≈ 0.8-0.9
    expect(report.overallScore).toBeGreaterThan(0.7);
    expect(report.overallScore).toBeLessThan(1);
    expect(report.holdingCount).toBe(2);
    expect(report.fullyEnriched).toBe(1);
    expect(report.poorlyEnriched + report.partiallyEnriched).toBe(1);
  });

  it("telt unknown-sector-weight alleen voor EQUITY", () => {
    const report = assessPortfolioQuality({
      holdings: [
        {
          holding: makeHolding({
            id: "etf",
            ticker: "VUSA.AS",
            assetClass: "ETF",
            isin: "IE1",
          }),
          enrichment: makeEnrichment({
            assetClass: "ETF",
            sector: null,
            region: "Europe",
          }),
          weight: 0.5,
        },
        {
          holding: makeHolding({
            id: "eq",
            ticker: "NVDA",
            isin: "US1",
          }),
          enrichment: makeEnrichment({ sector: null }),
          weight: 0.5,
        },
      ],
    });
    // Alleen de EQUITY met null sector telt mee: 0.5
    expect(report.unknownSectorWeight).toBe(0.5);
  });

  it("distributionBySource telt bronnen over alle holdings", () => {
    const report = assessPortfolioQuality({
      holdings: [
        {
          holding: makeHolding({ id: "a" }),
          enrichment: makeEnrichment({
            sources: ["input", "yahoo-search", "yahoo-profile"],
          }),
          weight: 0.5,
        },
        {
          holding: makeHolding({ id: "b" }),
          enrichment: makeEnrichment({ sources: ["input", "yahoo-search"] }),
          weight: 0.5,
        },
      ],
    });
    expect(report.distributionBySource.input).toBe(2);
    expect(report.distributionBySource["yahoo-search"]).toBe(2);
    expect(report.distributionBySource["yahoo-profile"]).toBe(1);
  });

  it("lege portefeuille: overallScore 0, geen crash", () => {
    const report = assessPortfolioQuality({ holdings: [] });
    expect(report.overallScore).toBe(0);
    expect(report.holdingCount).toBe(0);
    expect(report.holdings).toEqual([]);
  });
});

describe("portfolioQualityVerdict", () => {
  it("≥ 0.85 → Goed/positive", () => {
    expect(portfolioQualityVerdict(0.9)).toEqual({
      label: "Goed",
      tone: "positive",
    });
  });
  it("≥ 0.65 < 0.85 → Acceptabel/neutral", () => {
    expect(portfolioQualityVerdict(0.7)).toEqual({
      label: "Acceptabel",
      tone: "neutral",
    });
  });
  it("< 0.65 → Zwak/warning", () => {
    expect(portfolioQualityVerdict(0.4)).toEqual({
      label: "Zwak",
      tone: "warning",
    });
  });
});

describe("SEVERITY_LABELS", () => {
  it("bevat Nederlandse labels voor alle severities", () => {
    expect(SEVERITY_LABELS.ok).toBe("Volledig");
    expect(SEVERITY_LABELS.minor).toBe("Deels");
    expect(SEVERITY_LABELS.major).toBe("Onvolledig");
  });
});

describe("normalizedTicker in HoldingQuality", () => {
  it("toont afwijkende resolved symbol (bv. VANGUARD → VUSA.AS)", () => {
    const q = assessHoldingQuality({
      holding: makeHolding({ ticker: "VANGUARD" }),
      enrichment: makeEnrichment({
        ticker: "VANGUARD",
        normalizedTicker: "VUSA.AS",
      }),
      weight: 0.1,
    });
    expect(q.normalizedTicker).toBe("VUSA.AS");
  });

  it("null wanneer enrichment ontbreekt", () => {
    const q = assessHoldingQuality({
      holding: makeHolding({ ticker: "ASML" }),
      enrichment: null,
      weight: 0.1,
    });
    expect(q.normalizedTicker).toBeNull();
  });

  it("null wanneer resolved gelijk is aan input (geen visuele ruis)", () => {
    const q = assessHoldingQuality({
      holding: makeHolding({ ticker: "NVDA" }),
      enrichment: makeEnrichment({ ticker: "NVDA", normalizedTicker: "NVDA" }),
      weight: 0.1,
    });
    expect(q.normalizedTicker).toBeNull();
  });
});
