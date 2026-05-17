/**
 * Fixtures voor de explainability-tests. Niet voor productie.
 */

import type { BehavioralSignalWithState } from "@/lib/analytics/behavioral";
import type { PortfolioHealthScore } from "@/lib/analytics/health-score";
import type { MacroRegimeReport } from "@/lib/analytics/macro-regime";
import type { InvestmentConfidenceScore } from "@/lib/analytics/signal-fusion";
import type { PortfolioRiskSummary } from "@/types/risk";

import type {
  BehavioralExplainContext,
  ScenarioExplainContext,
} from "./prompts";

export function makeHealthScoreFixture(
  overrides: Partial<PortfolioHealthScore> = {},
): PortfolioHealthScore {
  const base: PortfolioHealthScore = {
    portfolioId: "p-1",
    asOf: "2026-05-10T00:00:00.000Z",
    totalScore: 72,
    grade: "B",
    confidence: 0.8,
    headline: "Solide spreiding maar hoge sectorconcentratie.",
    topRecommendations: [
      {
        title: "Diversifieer over sectoren",
        detail: "42% in Tech — overweeg een complementaire sector.",
        link: "/maandbeslissing",
        expectedImpact: 6,
      },
    ],
    components: [
      {
        key: "diversification",
        label: "Spreiding",
        score: 80,
        weight: 0.15,
        contribution: 12,
        status: "strong",
        rationale: "Goede spreiding (12 posities, top-5 50%).",
        recommendations: [],
        metricValue: 0.10,
        confidence: 1,
      },
      {
        key: "sector_concentration",
        label: "Sectorconcentratie",
        score: 35,
        weight: 0.10,
        contribution: 3.5,
        status: "weak",
        rationale: "Sector Technology 42%.",
        recommendations: [],
        metricValue: 0.42,
        confidence: 1,
      },
    ],
    effectiveWeight: 0.95,
    dataQuality: {
      score: 85,
      tier: "high",
      activeComponents: 9,
      totalComponents: 10,
      coverageRatio: 0.9,
      meanConfidence: 0.85,
      warning: null,
    },
  };
  return { ...base, ...overrides };
}

export function makeConfidenceScoreFixture(
  overrides: Partial<InvestmentConfidenceScore> = {},
): InvestmentConfidenceScore {
  const base: InvestmentConfidenceScore = {
    ticker: "ASML",
    asOf: "2026-05-10T00:00:00.000Z",
    totalScore: 78,
    tier: "POSITIVE",
    headline: "Sterke score — fundamentele kwaliteit draagt zwaarst bij.",
    signals: [
      {
        key: "fundamental_quality",
        label: "Fundamentele kwaliteit",
        score: 85,
        weight: 0.20,
        contribution: 17,
        rationale: "Quality 85/100 (ROIC 22%).",
        dataQuality: "high",
        metric: 85,
        source: "factor-engine",
      },
      {
        key: "valuation",
        label: "Waardering",
        score: 60,
        weight: 0.15,
        contribution: 9,
        rationale: "Value 60/100 (P/E 18).",
        dataQuality: "high",
        metric: 60,
        source: "factor-engine",
      },
    ],
    effectiveWeight: 0.85,
    dataQuality: "medium",
    dataLimitations: ["3 signalen zonder data: Earnings-revisies, Sentiment, Insider/analyst."],
    warning: null,
  };
  return { ...base, ...overrides };
}

export function makeMacroReportFixture(
  overrides: Partial<MacroRegimeReport> = {},
): MacroRegimeReport {
  const base: MacroRegimeReport = {
    classification: {
      asOf: "2026-05-10",
      regime: "STAGFLATION",
      confidence: 0.7,
      narrative:
        "Het huidige regime lijkt op dalende groei + hardnekkige inflatie. Groei daalt terwijl inflatie hardnekkig hoog blijft.",
      indicators: [
        {
          key: "growth",
          label: "Groei",
          trend: "falling",
          score: 35,
          rawValue: 1.4,
          rawUnit: "% YoY",
          rationale: "BBP-groei rond 1.4% YoY (dalend).",
          confidence: 0.7,
          asOf: "2026-05-10",
          source: "seed",
        },
        {
          key: "inflation",
          label: "Inflatie",
          trend: "rising",
          score: 30,
          rawValue: 3.1,
          rawUnit: "% YoY",
          rationale: "CPI 3.1% YoY (stijgend); boven 2%-target.",
          confidence: 0.7,
          asOf: "2026-05-10",
          source: "seed",
        },
      ],
      supportingIndicators: ["volatility", "recession_risk"],
      conflictingIndicators: [],
    },
    assetMapping: {
      regime: "STAGFLATION",
      impacts: [
        {
          assetClass: "GOLD",
          label: "Goud",
          direction: "tailwind",
          magnitude: 0.85,
          rationale: "Klassieke stagflatie-hedge.",
        },
        {
          assetClass: "EQUITY_GROWTH",
          label: "Groei-aandelen",
          direction: "headwind",
          magnitude: 0.85,
          rationale: "Hoge rente + lage groei = tegenwind.",
        },
      ],
    },
    portfolioImpact: {
      regime: "STAGFLATION",
      summary:
        "In een stagflation-klimaat zit je portefeuille relatief zwaar in groei-aandelen.",
      alignmentScore: 45,
      topGaps: [],
      buckets: [],
    },
  };
  return { ...base, ...overrides };
}

export function makeBehavioralContextFixture(
  overrides: Partial<BehavioralExplainContext> = {},
): BehavioralExplainContext {
  const signals: BehavioralSignalWithState[] = [
    {
      id: "OVERCONCENTRATION:ASML",
      key: "OVERCONCENTRATION",
      severity: "elevated",
      title: "ASML weegt 22% — flinke single-name exposure",
      message:
        "ASML staat op 22% van je portefeuille. Een grote positie kan goed zijn als bewuste convictie.",
      metric: 0.22,
      threshold: 0.15,
      reflectionQuestions: [
        {
          key: "concentration_drop_30",
          question: "Wat zou je doen als deze positie morgen 30% daalt?",
        },
      ],
      ticker: "ASML",
      nextStep: "Overweeg een geleidelijke trim.",
      sourceEngines: ["portfolio-view"],
      detectedAt: "2026-05-10T00:00:00.000Z",
      state: null,
      effectiveStatus: "ACTIVE",
    },
  ];
  return {
    signals,
    activeCount: 1,
    ...overrides,
  };
}

export function makeRiskFixture(
  overrides: Partial<PortfolioRiskSummary> = {},
): PortfolioRiskSummary {
  const base: PortfolioRiskSummary = {
    portfolioId: "p-1",
    asOf: "2026-05-10T00:00:00.000Z",
    overallSeverity: "moderate",
    concentrationHhi: 0.15,
    largestPositionWeight: 0.18,
    sectorConcentrationHhi: 0.30,
    regionConcentrationHhi: 0.55,
    portfolioVolatility: 0.21,
    maxDrawdown: 0.15,
    foreignCurrencyExposure: 0.45,
    exposures: { byAssetClass: [], bySector: [], byRegion: [], byCurrency: [] },
    positions: [],
    flags: [
      {
        code: "concentration.position",
        label: "Hoge positie-concentratie",
        severity: "elevated",
        message: "ASML 18% van portefeuille.",
      },
    ],
  };
  return { ...base, ...overrides };
}

export function makeScenarioContextFixture(
  overrides: Partial<ScenarioExplainContext> = {},
): ScenarioExplainContext {
  return {
    baseCurrency: "EUR",
    scenarios: [
      {
        name: "Recessie",
        description: "Wereldwijde recessie met -25% equities-shock.",
        portfolioImpactPct: -0.18,
        severity: "high",
      },
      {
        name: "Rente-shock",
        description: "10y-rente +200bp, growth-aandelen het zwaarst geraakt.",
        portfolioImpactPct: -0.10,
        severity: "moderate",
      },
      {
        name: "Soft landing",
        description: "Inflatie koelt af, groei houdt stand.",
        portfolioImpactPct: 0.06,
        severity: "low",
      },
    ],
    ...overrides,
  };
}
