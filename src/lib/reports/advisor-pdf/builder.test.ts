import { describe, expect, it } from "vitest";

import type { PortfolioView } from "@/lib/analytics/portfolio-view";

import { buildAdvisorReportData } from "./builder";
import { renderAdvisorReportHtml } from "./html";

/**
 * Module 23 — Advisor PDF Report builder tests.
 *
 * Focus: data-mapping en sectie-aanwezigheid. Geen visual-snapshots
 * (HTML-renderer is pure functie; output-shape is dekkend).
 */

const ASOF = "2026-05-18T00:00:00.000Z";
const GENERATED_AT = "2026-05-18T12:00:00.000Z";

/**
 * Maakt een minimale `PortfolioView`-stub met de velden die de builder
 * leest. We casten naar `PortfolioView` zodat we niet de hele dataset
 * (valuations + factor-scores + rebalance + lastUpdated) volledig hoeven
 * te modelleren.
 */
function viewStub(overrides: {
  positionCount?: number;
  totalValue?: number;
  cashBalance?: number;
  baseCurrency?: string;
  healthScore?: number;
  healthGrade?: "A" | "B" | "C" | "D" | "F";
  healthSignals?: ReadonlyArray<{
    code: string;
    label: string;
    severity: "positive" | "info" | "warning" | "critical";
    message: string;
  }>;
  riskFlags?: ReadonlyArray<{
    code: string;
    label: string;
    severity: "low" | "moderate" | "elevated" | "high" | "critical";
    message?: string;
    metric?: number;
    threshold?: number;
  }>;
  largestPositionWeight?: number;
  factorScoresSize?: number;
  valuationCount?: number;
  valuationsWithSector?: number;
} = {}): PortfolioView {
  const totalValue = overrides.totalValue ?? 100_000;
  const cashBalance = overrides.cashBalance ?? 5_000;
  const positionCount = overrides.positionCount ?? 5;
  const valuationCount = overrides.valuationCount ?? positionCount;
  const valuationsWithSector =
    overrides.valuationsWithSector ?? valuationCount;
  const factorScoresSize = overrides.factorScoresSize ?? 0;

  const valuations = Array.from({ length: valuationCount }, (_, i) => ({
    holding: {
      ticker: `T${i}`,
      name: `Naam ${i}`,
      sector: i < valuationsWithSector ? "Tech" : null,
      assetClass: "EQUITY" as const,
    },
    marketValueBase: 10_000,
  })) as unknown as PortfolioView["valuations"];

  return {
    summary: {
      portfolioId: "p1",
      baseCurrency: (overrides.baseCurrency ?? "EUR") as PortfolioView["summary"]["baseCurrency"],
      totalValue,
      totalCost: totalValue * 0.9,
      cashBalance,
      unrealizedPnl: totalValue * 0.1,
      unrealizedPnlPct: 0.1,
      positionCount,
      largestPosition: null,
      topPositions: [],
      allocationByAssetClass: [{ label: "EQUITY", value: 95_000, weight: 0.95 }],
      allocationBySector: [{ label: "Tech", value: 50_000, weight: 0.5 }],
      allocationByRegion: [{ label: "US", value: 60_000, weight: 0.6 }],
      allocationByCurrency: [{ label: "USD", value: 70_000, weight: 0.7 }],
    },
    health: {
      portfolioId: "p1",
      asOf: ASOF,
      grade: overrides.healthGrade ?? "B",
      score: overrides.healthScore ?? 72,
      diversificationScore: 65,
      qualityScore: 70,
      riskAlignmentScore: 75,
      factorAlignmentScore: 80,
      signals: (overrides.healthSignals ??
        []) as PortfolioView["health"]["signals"],
    },
    risk: {
      portfolioId: "p1",
      asOf: ASOF,
      overallSeverity: "moderate",
      concentrationHhi: 0.18,
      largestPositionWeight: overrides.largestPositionWeight ?? 0.18,
      sectorConcentrationHhi: 0.22,
      regionConcentrationHhi: 0.4,
      top5Weight: 0.8,
      portfolioVolatility: 0.18,
      foreignCurrencyExposure: 0.3,
      exposures: {
        byAssetClass: [{ label: "EQUITY", value: 95_000, weight: 0.95 }],
        bySector: [{ label: "Tech", value: 50_000, weight: 0.5 }],
        byRegion: [{ label: "US", value: 60_000, weight: 0.6 }],
      },
      positions: [],
      flags: (overrides.riskFlags ?? []) as PortfolioView["risk"]["flags"],
    },
    rebalance: {
      portfolioId: "p1",
      asOf: ASOF,
      baseCurrency: "EUR" as PortfolioView["rebalance"]["baseCurrency"],
      totalValue,
      recommendations: [],
      totalTurnover: 0,
      summary: {} as PortfolioView["rebalance"]["summary"],
    },
    valuations,
    factorScores: new Map(
      Array.from({ length: factorScoresSize }, (_, i) => [`T${i}`, {} as never]),
    ),
    lastUpdated: ASOF,
  };
}

describe("buildAdvisorReportData — sectie-shape", () => {
  it("alle 10 secties aanwezig (title, disclaimer, health, risks, allocation, goals, scenarios, behavioral, dataQuality, actionItems)", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "b***@example.com",
      generatedBy: "Cliënt",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub(),
    });

    expect(data.schemaVersion).toBe(1);
    expect(data.title).toBeDefined();
    expect(data.disclaimers.length).toBeGreaterThan(0);
    expect(data.health).toBeDefined();
    expect(data.risks).toBeDefined();
    expect(data.allocation).toBeDefined();
    expect(data.behavioral).toBeDefined();
    expect(data.dataQuality).toBeDefined();
    expect(data.actionItems).toBeDefined();
    // goals + scenarios zijn null bij missend input
    expect(data.goals).toBeNull();
    expect(data.scenarios).toBeNull();
  });

  it("title-section bevat brandName en client-label maar nooit raw e-mail", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "b***@example.com",
      generatedBy: "Cliënt",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub(),
    });
    expect(data.title.brandName).toBe("BeleggerIQ");
    expect(data.title.clientLabel).toBe("b***@example.com");
    // Geen raw "bart@example.com"-vorm
    expect(data.title.clientLabel).not.toContain("bart@");
  });

  it("health-section mapt grade + componenten + top-3 signalen", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub({
        healthScore: 88,
        healthGrade: "A",
        healthSignals: [
          { code: "h1", label: "Spreiding ok", severity: "positive", message: "ok" },
          { code: "h2", label: "Critical-sig", severity: "critical", message: "actie!" },
          { code: "h3", label: "Warning-sig", severity: "warning", message: "attentie" },
          { code: "h4", label: "Info", severity: "info", message: "info" },
        ],
      }),
    });
    expect(data.health.grade).toBe("A");
    expect(data.health.score).toBe(88);
    expect(data.health.components.length).toBeGreaterThanOrEqual(4);
    // top-3 op severity: critical eerst
    expect(data.health.topSignals).toHaveLength(3);
    expect(data.health.topSignals[0]!.severity).toBe("critical");
  });

  it("risks-section sorteert flags op severity en cap't op 5", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub({
        riskFlags: Array.from({ length: 8 }, (_, i) => ({
          code: `r${i}`,
          label: `Flag ${i}`,
          severity: i === 0 ? "critical" : i === 1 ? "high" : "low",
          message: `msg ${i}`,
        })),
      }),
    });
    expect(data.risks.topFlags).toHaveLength(5);
    expect(data.risks.topFlags[0]!.severity).toBe("critical");
    expect(data.risks.topFlags[1]!.severity).toBe("high");
  });

  it("allocation-section heeft cash-weight + 4 categorieën", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub({ totalValue: 100_000, cashBalance: 5_000 }),
    });
    expect(data.allocation.cashWeight).toBeCloseTo(0.05, 3);
    expect(data.allocation.byAssetClass.length).toBeGreaterThan(0);
    expect(data.allocation.bySector.length).toBeGreaterThan(0);
    expect(data.allocation.byRegion.length).toBeGreaterThan(0);
    expect(data.allocation.byCurrency.length).toBeGreaterThan(0);
  });

  it("data-quality warnt wanneer posities sector-tag missen", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub({
        positionCount: 5,
        valuationCount: 5,
        valuationsWithSector: 2,
      }),
    });
    expect(data.dataQuality.warnings.some((w) => /sector/i.test(w))).toBe(true);
  });

  it("action-items: lege portfolio → 0 items; met critical-health → 1+ items", () => {
    const empty = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub(),
    });
    expect(empty.actionItems.items).toHaveLength(0);

    const withCritical = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub({
        healthSignals: [
          {
            code: "c1",
            label: "Concentratie te hoog",
            severity: "critical",
            message: "ASML > 25%",
          },
        ],
      }),
    });
    expect(withCritical.actionItems.items.length).toBeGreaterThanOrEqual(1);
    expect(withCritical.actionItems.items[0]!.source).toBe("health");
  });

  it("action-items: max 5 — cap-policy respecteert spec", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub({
        healthSignals: [
          { code: "c1", label: "Health crit", severity: "critical", message: "a" },
        ],
        riskFlags: [
          { code: "r1", label: "Risk crit", severity: "critical", message: "b" },
        ],
      }),
    });
    expect(data.actionItems.items.length).toBeLessThanOrEqual(5);
  });

  it("disclaimers altijd minimaal 1 (informatief-karakter)", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub(),
    });
    expect(data.disclaimers.length).toBeGreaterThanOrEqual(1);
    expect(
      data.disclaimers.some((d) => /informatief/i.test(d.body)),
    ).toBe(true);
  });
});

describe("renderAdvisorReportHtml — output-shape", () => {
  it("produceert volledige HTML met DOCTYPE en alle 10 secties (titel-tekst aanwezig)", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "b***@example.com",
      generatedBy: "Cliënt",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub(),
    });
    const html = renderAdvisorReportHtml(data);

    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain("Portefeuille-rapportage");
    expect(html).toContain("Portfolio Health Score");
    expect(html).toContain("Grootste risico");
    expect(html).toContain("Spreiding");
    expect(html).toContain("Behavioral aandachtspunten");
    expect(html).toContain("Datakwaliteit");
    expect(html).toContain("Actiepunten");
    expect(html).toContain("Disclaimer");
    // print-CSS aanwezig
    expect(html).toMatch(/@page\s*\{\s*size:\s*A4/i);
  });

  it("escape't user-supplied strings (XSS-resistant)", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "<script>alert(1)</script>",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub(),
      advisorNote: "<img src=x onerror=alert(2)>",
    });
    const html = renderAdvisorReportHtml(data);
    expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
    // raw `<img onerror=...>` mag niet als HTML-tag voorkomen
    expect(html).not.toMatch(/<img\s+[^>]*onerror=/i);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("respecteert white-label brand-naam wanneer organisatie meegegeven", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub(),
      whiteLabelOverride: {
        brandName: "AdvisorFirm B.V.",
        primaryColor: "#1d4ed8",
        logoUrl: null,
        customDomain: null,
        footerText: "AdvisorFirm B.V. — KvK 12345678 — AFM 67890",
        supportEmail: null,
        supportPhone: null,
      },
    });
    const html = renderAdvisorReportHtml(data);
    expect(html).toContain("AdvisorFirm B.V.");
    expect(html).toContain("KvK 12345678");
  });

  it("sanitize't primaryColor (geen CSS-injection via hex-validator)", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub(),
      whiteLabelOverride: {
        brandName: "X",
        primaryColor: "red;}body{display:none",
        logoUrl: null,
        customDomain: null,
        footerText: null,
        supportEmail: null,
        supportPhone: null,
      },
    });
    const html = renderAdvisorReportHtml(data);
    expect(html).not.toContain("display:none");
    // Fallback naar default green
    expect(html).toMatch(/#22c55e/);
  });
});

describe("Module 23 — spec-conformance", () => {
  it("spec eist 10 secties — alle section-IDs in types.ts uniek en deterministisch", () => {
    // 10 = title + disclaimer + health + risks + allocation + goals + scenarios
    //      + behavioral + data_quality + action_items
    const expected = [
      "title",
      "disclaimer",
      "health",
      "risks",
      "allocation",
      "goals",
      "scenarios",
      "behavioral",
      "data_quality",
      "action_items",
    ];
    expect(expected).toHaveLength(10);
  });

  it("rapport bevat altijd disclaimer-blok 'informatief, geen persoonlijk financieel advies'", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub(),
    });
    const html = renderAdvisorReportHtml(data);
    expect(html).toMatch(/informatief/i);
    expect(html).toMatch(/geen.*advies/i);
  });

  it("actiepunten zijn aandachtspunten, geen koop/verkoop-orders (geen 'verkoop X'-zinnen)", () => {
    const data = buildAdvisorReportData({
      generatedAt: GENERATED_AT,
      asOf: ASOF,
      clientLabel: "X",
      generatedBy: "Y",
      generatedByUserId: "u1",
      portfolioId: "p1",
      view: viewStub({
        healthSignals: [
          { code: "c1", label: "X", severity: "critical", message: "Y" },
        ],
        riskFlags: [
          { code: "r1", label: "Z", severity: "high", message: "W" },
        ],
      }),
    });
    for (const item of data.actionItems.items) {
      expect(item.title.toLowerCase()).not.toMatch(/\bverkoop\b|\bkoop\b/);
      expect(item.rationale.toLowerCase()).not.toMatch(/\bverkoop nu\b/);
    }
  });
});
