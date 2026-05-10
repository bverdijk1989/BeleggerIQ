import { describe, expect, it } from "vitest";

import type { PortfolioView } from "../analytics/portfolio-view";
import type { Holding } from "@/types/portfolio";

import { buildContributorPayload } from "./anonymizer";
import { buildSyntheticBaseline, listAllCohorts } from "./baselines";
import { buildCommunityBenchmark } from "./benchmark";
import { buildCohort, riskProfileToBucket, sizeToBucket, ageToBucket } from "./cohort";
import {
  buildConsent,
  hasConsent,
  isContributing,
  parseCommunityConsent,
} from "./consent";
import {
  CONSENT_TEXT_VERSION,
  K_ANONYMITY_THRESHOLD,
  type CommunityAggregate,
  type CommunityConsent,
  type ConsentScope,
} from "./types";

// ============================================================
//  Test helpers
// ============================================================

function makeHolding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h1",
    portfolioId: "p1",
    ticker: "ASML",
    name: "ASML Holding",
    assetClass: "EQUITY",
    currency: "EUR",
    quantity: 10,
    avgCostPrice: 500,
    sector: "Technology",
    ...overrides,
  };
}

function makeView(opts: {
  totalValue?: number;
  totalCost?: number;
  unrealizedPnl?: number;
  beta?: number;
  vol?: number;
  hhi?: number;
  topPositionsWeights?: number[];
  allocationByAssetClass?: { label: string; value: number; weight: number }[];
  valuations?: Array<{ sector: string | null; marketValueBase: number }>;
} = {}): PortfolioView {
  const totalValue = opts.totalValue ?? 100_000;
  const totalCost = opts.totalCost ?? 80_000;
  const allocationByAssetClass = opts.allocationByAssetClass ?? [
    { label: "EQUITY", value: 80_000, weight: 0.8 },
    { label: "BOND", value: 15_000, weight: 0.15 },
    { label: "CASH", value: 5_000, weight: 0.05 },
  ];
  const valuations = (opts.valuations ?? [
    { sector: "Technology", marketValueBase: 60_000 },
    { sector: "Healthcare", marketValueBase: 25_000 },
    { sector: "Financials", marketValueBase: 15_000 },
  ]).map((v) => ({
    holding: makeHolding({ sector: v.sector }),
    unitPrice: 100,
    marketValue: v.marketValueBase,
    marketValueBase: v.marketValueBase,
    costBasisBase: v.marketValueBase * 0.8,
    unrealizedPnlBase: v.marketValueBase * 0.2,
    fxRate: 1,
    priceSource: "market" as const,
    asOf: new Date().toISOString(),
  }));

  const topPositions = (opts.topPositionsWeights ?? [0.25, 0.15, 0.10]).map(
    (w, i) => ({
      ticker: `T${i}`,
      name: `Test ${i}`,
      marketValue: w * totalValue,
      weight: w,
      unrealizedPnl: 0,
      unrealizedPnlPct: 0,
    }),
  );

  return {
    summary: {
      portfolioId: "p1",
      baseCurrency: "EUR",
      totalValue,
      totalCost,
      cashBalance: 5_000,
      unrealizedPnl: opts.unrealizedPnl ?? totalValue - totalCost,
      unrealizedPnlPct: 0,
      positionCount: valuations.length,
      largestPosition: topPositions[0] ?? null,
      topPositions,
      allocationByAssetClass,
      allocationBySector: [],
      allocationByRegion: [],
      allocationByCurrency: [],
    },
    health: {} as PortfolioView["health"],
    risk: {
      portfolioId: "p1",
      asOf: new Date().toISOString(),
      overallSeverity: "moderate",
      concentrationHhi: opts.hhi ?? 0.12,
      largestPositionWeight: 0.25,
      sectorConcentrationHhi: 0.20,
      regionConcentrationHhi: 0.50,
      portfolioBeta: opts.beta ?? 1.0,
      portfolioVolatility: opts.vol ?? 0.15,
      exposures: { byAssetClass: [], bySector: [], byRegion: [] },
      positions: [],
      flags: [],
    } as PortfolioView["risk"],
    rebalance: {} as PortfolioView["rebalance"],
    valuations,
    factorScores: new Map(),
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================================
//  Cohort
// ============================================================

describe("cohort builder", () => {
  it("ageToBucket maakt 4 buckets", () => {
    expect(ageToBucket(25)).toBe("<30");
    expect(ageToBucket(35)).toBe("30-45");
    expect(ageToBucket(55)).toBe("45-60");
    expect(ageToBucket(70)).toBe("60+");
    expect(ageToBucket(null)).toBe("30-45");
  });

  it("sizeToBucket gaat van <10k tot 200k+", () => {
    expect(sizeToBucket(5_000)).toBe("<10k");
    expect(sizeToBucket(25_000)).toBe("10-50k");
    expect(sizeToBucket(150_000)).toBe("50-200k");
    expect(sizeToBucket(500_000)).toBe("200k+");
  });

  it("riskProfileToBucket is tolerant voor onbekende waarden", () => {
    expect(riskProfileToBucket("CONSERVATIVE")).toBe("conservative");
    expect(riskProfileToBucket("aggressive")).toBe("aggressive");
    expect(riskProfileToBucket("groei")).toBe("growth");
    expect(riskProfileToBucket("nonsense")).toBe("balanced");
    expect(riskProfileToBucket(null)).toBe("balanced");
  });

  it("buildCohort levert deterministische key", () => {
    const c1 = buildCohort({ age: 35, riskProfile: "balanced", totalValue: 30_000 });
    const c2 = buildCohort({ age: 35, riskProfile: "balanced", totalValue: 30_000 });
    expect(c1.key).toBe(c2.key);
    expect(c1.key).toBe("30-45|balanced|10-50k");
  });

  it("listAllCohorts levert exact 64 cohorts (4 × 4 × 4)", () => {
    expect(listAllCohorts()).toHaveLength(64);
  });
});

// ============================================================
//  Consent
// ============================================================

describe("consent parser + builder", () => {
  it("parse default-deny op lege blob", () => {
    const c = parseCommunityConsent(null);
    expect(c.scopes).toHaveLength(0);
    expect(c.consentTextVersion).toBe(0);
  });

  it("parse droppt onbekende scope-strings", () => {
    const c = parseCommunityConsent({
      scopes: ["RISK_PROFILE", "NOT_A_SCOPE"],
    });
    expect(c.scopes).toEqual(["RISK_PROFILE"]);
  });

  it("parse droppt duplicates", () => {
    const c = parseCommunityConsent({
      scopes: ["RISK_PROFILE", "RISK_PROFILE"],
    });
    expect(c.scopes).toEqual(["RISK_PROFILE"]);
  });

  it("buildConsent stamps versie en updatedAt", () => {
    const now = new Date("2026-05-10T12:00:00.000Z");
    const c = buildConsent(["RISK_PROFILE", "PORTFOLIO_ALLOCATION"], now);
    expect(c.consentTextVersion).toBe(CONSENT_TEXT_VERSION);
    expect(c.updatedAt).toBe(now.toISOString());
    // canonicale volgorde
    expect(c.scopes).toEqual(["PORTFOLIO_ALLOCATION", "RISK_PROFILE"]);
  });

  it("hasConsent + isContributing", () => {
    const empty: CommunityConsent = {
      scopes: [],
      updatedAt: null,
      consentTextVersion: 0,
    };
    expect(isContributing(empty)).toBe(false);
    expect(hasConsent(empty, "RISK_PROFILE")).toBe(false);

    const filled = buildConsent(["RISK_PROFILE"]);
    expect(isContributing(filled)).toBe(true);
    expect(hasConsent(filled, "RISK_PROFILE")).toBe(true);
    expect(hasConsent(filled, "PORTFOLIO_ALLOCATION")).toBe(false);
  });
});

// ============================================================
//  Anonymizer (privacy-laag)
// ============================================================

describe("buildContributorPayload — privacy-laag", () => {
  const cohort = buildCohort({ age: 40, riskProfile: "balanced", totalValue: 100_000 });
  const fullConsent = buildConsent([
    "PORTFOLIO_ALLOCATION",
    "RISK_PROFILE",
    "DIVIDEND_STRATEGY",
    "SECTOR_BENCHMARK",
    "PERFORMANCE_BENCHMARK",
  ]);
  const view = makeView();

  it("zonder enige scope → lege payload (geen scopes-key)", () => {
    const p = buildContributorPayload({
      view,
      cohort,
      consent: { scopes: [], updatedAt: null, consentTextVersion: 0 },
    });
    expect(Object.keys(p.scopes)).toHaveLength(0);
  });

  it("alleen geselecteerde scopes komen in de payload", () => {
    const p = buildContributorPayload({
      view,
      cohort,
      consent: buildConsent(["RISK_PROFILE"]),
    });
    expect(p.scopes.RISK_PROFILE).toBeDefined();
    expect(p.scopes.PORTFOLIO_ALLOCATION).toBeUndefined();
    expect(p.scopes.SECTOR_BENCHMARK).toBeUndefined();
  });

  it("PORTFOLIO_ALLOCATION bucketeert tot equity/bonds/cash/alt", () => {
    const p = buildContributorPayload({ view, cohort, consent: fullConsent });
    const a = p.scopes.PORTFOLIO_ALLOCATION!;
    expect(a.equityPct + a.bondsPct + a.cashPct + a.altPct).toBeCloseTo(1.0, 2);
    expect(a.equityPct).toBeGreaterThan(0.7); // 80% equity in fixture
  });

  it("RISK_PROFILE rondt beta op 0.1-stappen", () => {
    const v = makeView({ beta: 1.234 });
    const p = buildContributorPayload({ view: v, cohort, consent: fullConsent });
    expect(p.scopes.RISK_PROFILE!.beta).toBe(1.2);
  });

  it("DIVIDEND_STRATEGY: yieldBucket is categorisch (geen exact %)", () => {
    const p = buildContributorPayload({
      view,
      cohort,
      consent: fullConsent,
      dividendYield: 0.025,
    });
    expect(p.scopes.DIVIDEND_STRATEGY!.yieldBucket).toBe("2-4%");
  });

  it("SECTOR_BENCHMARK: max 3 sectoren, geen gewichten", () => {
    const p = buildContributorPayload({ view, cohort, consent: fullConsent });
    const s = p.scopes.SECTOR_BENCHMARK!;
    expect(s.topSectors.length).toBeLessThanOrEqual(3);
    // bevat alleen sector-strings (bucket-namen), geen tickers
    for (const t of s.topSectors) {
      expect(t).not.toMatch(/[A-Z]{3,5}\.?[A-Z]*/); // geen ticker-ish strings
    }
  });

  it("PERFORMANCE_BENCHMARK levert bucket, niet exact %", () => {
    const p = buildContributorPayload({
      view,
      cohort,
      consent: fullConsent,
      ytdReturnPct: 0.18,
    });
    expect(p.scopes.PERFORMANCE_BENCHMARK!.ytdBucket).toBe("+10..+25%");
  });

  it("anonymizer is deterministisch", () => {
    const a = buildContributorPayload({
      view,
      cohort,
      consent: fullConsent,
      ytdReturnPct: 0.05,
      asOf: "2026-05-10T00:00:00.000Z",
    });
    const b = buildContributorPayload({
      view,
      cohort,
      consent: fullConsent,
      ytdReturnPct: 0.05,
      asOf: "2026-05-10T00:00:00.000Z",
    });
    expect(a).toEqual(b);
  });
});

// ============================================================
//  Synthetic baseline + k-anonymity
// ============================================================

describe("buildSyntheticBaseline", () => {
  it("levert source = synthetic-baseline + sampleSize 0", () => {
    const cohort = buildCohort({ age: 35, riskProfile: "growth", totalValue: 75_000 });
    const a = buildSyntheticBaseline(cohort);
    expect(a.source).toBe("synthetic-baseline");
    expect(a.sampleSize).toBe(0);
  });

  it("alle 5 scopes aanwezig in baseline", () => {
    const cohort = buildCohort({ age: 35, riskProfile: "balanced", totalValue: 30_000 });
    const a = buildSyntheticBaseline(cohort);
    expect(a.scopes.PORTFOLIO_ALLOCATION).toBeDefined();
    expect(a.scopes.RISK_PROFILE).toBeDefined();
    expect(a.scopes.DIVIDEND_STRATEGY).toBeDefined();
    expect(a.scopes.SECTOR_BENCHMARK).toBeDefined();
    expect(a.scopes.PERFORMANCE_BENCHMARK).toBeDefined();
  });

  it("conservative-cohort heeft lagere equity-mediaan dan aggressive", () => {
    const cons = buildSyntheticBaseline(
      buildCohort({ age: 60, riskProfile: "conservative", totalValue: 100_000 }),
    );
    const aggr = buildSyntheticBaseline(
      buildCohort({ age: 35, riskProfile: "aggressive", totalValue: 100_000 }),
    );
    expect(cons.scopes.PORTFOLIO_ALLOCATION!.equityPct.p50).toBeLessThan(
      aggr.scopes.PORTFOLIO_ALLOCATION!.equityPct.p50,
    );
  });
});

// ============================================================
//  Benchmark engine + k-anonimiteit fallback
// ============================================================

describe("buildCommunityBenchmark", () => {
  const cohort = buildCohort({ age: 40, riskProfile: "balanced", totalValue: 100_000 });
  const fullConsent = buildConsent([
    "PORTFOLIO_ALLOCATION",
    "RISK_PROFILE",
    "DIVIDEND_STRATEGY",
    "SECTOR_BENCHMARK",
    "PERFORMANCE_BENCHMARK",
  ]);

  function buildPayload(overrides: Parameters<typeof makeView>[0] = {}) {
    const view = makeView(overrides);
    return buildContributorPayload({
      view,
      cohort,
      consent: fullConsent,
      ytdReturnPct: 0.05,
    });
  }

  it("zonder cohort-aggregate valt terug op synthetische baseline", () => {
    const report = buildCommunityBenchmark({ payload: buildPayload() });
    expect(report.comparisons.length).toBe(5);
    for (const c of report.comparisons) {
      expect(c.source).toBe("synthetic-baseline");
    }
  });

  it("cohort-aggregate met sample-size onder K → fallback naar baseline", () => {
    const tinyCohort: CommunityAggregate = {
      ...buildSyntheticBaseline(cohort),
      sampleSize: K_ANONYMITY_THRESHOLD - 1,
      source: "real",
    };
    const report = buildCommunityBenchmark({
      payload: buildPayload(),
      cohortAggregate: tinyCohort,
    });
    for (const c of report.comparisons) {
      // moet baseline gebruiken want sample te klein
      expect(c.source).toBe("synthetic-baseline");
    }
  });

  it("cohort-aggregate met sample-size >= K → wordt gebruikt", () => {
    const realCohort: CommunityAggregate = {
      ...buildSyntheticBaseline(cohort),
      sampleSize: K_ANONYMITY_THRESHOLD + 5,
      source: "real",
    };
    const report = buildCommunityBenchmark({
      payload: buildPayload(),
      cohortAggregate: realCohort,
    });
    for (const c of report.comparisons) {
      expect(c.source).toBe("real");
      expect(c.sampleSize).toBeGreaterThanOrEqual(K_ANONYMITY_THRESHOLD);
    }
  });

  it("zonder enige scope-payload → comparisons array is leeg", () => {
    const cohortLocal = buildCohort({
      age: 40,
      riskProfile: "balanced",
      totalValue: 100_000,
    });
    const payload = buildContributorPayload({
      view: makeView(),
      cohort: cohortLocal,
      consent: { scopes: [], updatedAt: null, consentTextVersion: 0 },
    });
    const report = buildCommunityBenchmark({ payload });
    expect(report.comparisons).toHaveLength(0);
    expect(report.attentionPoint).toBeNull();
  });

  it("attentionPoint wijst naar afwijkende scope", () => {
    // Maak een portefeuille met fors meer equity dan balanced-mediaan (0.55)
    const view = makeView({
      allocationByAssetClass: [
        { label: "EQUITY", value: 95_000, weight: 0.95 },
        { label: "CASH", value: 5_000, weight: 0.05 },
      ],
    });
    const payload = buildContributorPayload({
      view,
      cohort,
      consent: buildConsent(["PORTFOLIO_ALLOCATION"]),
    });
    const report = buildCommunityBenchmark({ payload });
    expect(report.attentionPoint).not.toBeNull();
    expect(report.attentionPoint?.tone).toBe("attention");
  });

  it("alleen scopes uit consent → alleen die comparisons", () => {
    const view = makeView();
    const payload = buildContributorPayload({
      view,
      cohort,
      consent: buildConsent(["RISK_PROFILE"]),
    });
    const report = buildCommunityBenchmark({ payload });
    expect(report.comparisons).toHaveLength(1);
    expect(report.comparisons[0]?.scope).toBe("RISK_PROFILE");
  });

  it("output is deterministisch", () => {
    const a = buildCommunityBenchmark({
      payload: buildPayload(),
      asOf: "2026-05-10T00:00:00.000Z",
    });
    const b = buildCommunityBenchmark({
      payload: buildPayload(),
      asOf: "2026-05-10T00:00:00.000Z",
    });
    expect(a).toEqual(b);
  });
});

// ============================================================
//  Privacy-properties (Buffett/Dalio-laag)
// ============================================================

describe("privacy invarianten", () => {
  it("payload bevat NOOIT tickers of namen, ook met fully-equity portefeuille", () => {
    const view = makeView({
      valuations: [
        { sector: "Technology", marketValueBase: 100_000 },
      ],
    });
    const cohort = buildCohort({ age: 40, riskProfile: "balanced", totalValue: 100_000 });
    const payload = buildContributorPayload({
      view,
      cohort,
      consent: buildConsent([
        "PORTFOLIO_ALLOCATION",
        "RISK_PROFILE",
        "SECTOR_BENCHMARK",
      ]),
    });
    const json = JSON.stringify(payload);
    expect(json).not.toContain("ASML");
    expect(json).not.toContain("Holding");
    expect(json).not.toContain("100000"); // exacte bedrag mag niet lekken
  });

  it("k-anonimiteit-drempel is minimaal 25", () => {
    expect(K_ANONYMITY_THRESHOLD).toBeGreaterThanOrEqual(25);
  });

  it("synthetische baselines alleen aangezet voor real-only-flag", () => {
    const cohort = buildCohort({ age: 40, riskProfile: "balanced", totalValue: 100_000 });
    const a = buildSyntheticBaseline(cohort);
    expect(a.source).toBe("synthetic-baseline");

    // Real-aggregate met sample 0 mag NIET als real worden geaccepteerd
    // (defensieve check: pickAggregate moet op K controleren)
    const fakeReal: CommunityAggregate = { ...a, source: "real", sampleSize: 0 };
    const payload = buildContributorPayload({
      view: makeView(),
      cohort,
      consent: buildConsent(["PORTFOLIO_ALLOCATION"] as ConsentScope[]),
    });
    const report = buildCommunityBenchmark({
      payload,
      cohortAggregate: fakeReal,
    });
    expect(report.comparisons[0]?.source).toBe("synthetic-baseline");
  });
});
