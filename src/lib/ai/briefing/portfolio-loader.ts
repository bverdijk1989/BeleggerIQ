/**
 * Server-side loader: bouwt de Daily Briefing voor één portfolio + user.
 *
 * Wrapper rond `buildBriefingContext` + `loadDailyBriefing` die zorgt dat
 * dashboard en /briefing-detail-pagina precies DEZELFDE context bouwen
 * — zelfde digest → één cache-entry → kostenefficiënt + consistent.
 *
 * Dependencies (allemaal al gebruikt op het dashboard):
 *  - PortfolioView via `buildPortfolioView`
 *  - PortfolioSnapshot[] via `portfolioSnapshotRepository`
 *  - MarketRegimeScore via `fetchRegimeInputs` + `computeRegimeScore`
 *  - dashboardActions + riskActions via bestaande engines
 *
 * Geen extra DB-werk: deze loader herhaalt wat het dashboard al doet —
 * gebruik 'em alleen wanneer je niet al een PortfolioView in de hand hebt.
 */

import {
  buildDashboardPrimaryActions,
  buildPortfolioView,
  buildRiskActions,
  classifyInstruments,
  defaultMetadata,
  detectPolicyViolations,
} from "@/lib/analytics";
import { capForHolding } from "@/lib/analytics/policy-engine/holding-cap";
import { computeRegimeScore } from "@/lib/analytics/regime/engine";
import { assessPortfolioQuality } from "@/lib/analytics/data-quality";
import { enrichInstruments } from "@/lib/data/instrument-enrichment";
import {
  portfolioRepository,
  portfolioSnapshotRepository,
} from "@/lib/data";
import { fetchRegimeInputs } from "@/lib/data/regime";

import { buildBriefingContext } from "./context";
import { loadDailyBriefing } from "./service";
import type { DailyBriefing } from "./types";

const DEFAULT_BUDGET = 500;

export interface LoadBriefingForPortfolioInput {
  userEmail: string;
  /** Override "vandaag" voor tests. */
  briefingDate?: string;
  forceRefresh?: boolean;
}

export interface LoadBriefingForPortfolioResult {
  briefing: DailyBriefing | null;
  /** True wanneer er geen primary portfolio gevonden is. */
  noPortfolio: boolean;
}

export async function loadBriefingForPortfolio(
  input: LoadBriefingForPortfolioInput,
): Promise<LoadBriefingForPortfolioResult> {
  const ctxLoaded = await portfolioRepository
    .findUserContextByEmail(input.userEmail)
    .catch(() => null);
  const portfolio = await portfolioRepository
    .findPrimaryByEmail(input.userEmail)
    .catch(() => null);
  if (!portfolio) return { briefing: null, noPortfolio: true };

  const profile = ctxLoaded?.profile ?? null;
  const monthlyContribution =
    typeof ctxLoaded?.monthlyContribution === "number"
      ? ctxLoaded.monthlyContribution
      : DEFAULT_BUDGET;

  const [view, regimeFetch, snapshots] = await Promise.all([
    buildPortfolioView(portfolio, {
      includeFundamentals: true,
      includeFactorScores: true,
    }),
    fetchRegimeInputs(),
    portfolioSnapshotRepository
      .listForPortfolio(portfolio.id, 180)
      .catch(() => []),
  ]);

  const regime = regimeFetch
    ? computeRegimeScore(regimeFetch.input, {
        asOf: regimeFetch.asOf,
        source: regimeFetch.source,
      })
    : null;

  // Dashboard actions — minimaal subset zonder cash-share-overlay magic.
  const enrichments = await enrichInstruments(
    portfolio.holdings.map((h) => ({
      ticker: h.ticker,
      isin: h.isin ?? null,
      name: h.name,
    })),
  ).catch(() => new Map());
  const classifications = classifyInstruments({
    items: portfolio.holdings.map((h) => ({
      holding: h,
      enrichment: enrichments.get(h.ticker) ?? null,
    })),
  });

  const instrumentLimitsByTicker = new Map<
    string,
    { allowedMaxWeight: number; runMultiplier: number }
  >();
  for (const [ticker, classification] of classifications) {
    const limit = capForHolding({
      classification,
      policy: { userMaxSinglePositionWeight: profile?.policy?.maxPositionWeight },
    });
    if (limit && Number.isFinite(limit.allowedMaxWeight)) {
      instrumentLimitsByTicker.set(ticker, {
        allowedMaxWeight: limit.allowedMaxWeight,
        runMultiplier: limit.runMultiplier,
      });
    }
  }

  // We hebben hier geen volledige actionPlan-engine; dat is acceptabel —
  // de briefing kan ook met alleen rebalance + risk-engine context werken.
  // Geef een lege actionPlan-shape door om de builder tevreden te stellen.
  const dashboardActions = buildDashboardPrimaryActions({
    actionPlan: {
      generatedAt: new Date().toISOString(),
      baseCurrency: view.summary.baseCurrency,
      positions: [],
      global: {
        overallAdvice: "INSUFFICIENT_DATA",
        reason: "Briefing-loader gebruikt geen volledige action-engine.",
        urgency: "LOW",
        distribution: {
          BUY: 0,
          HOLD: 0,
          TRIM: 0,
          SELL: 0,
          DO_NOTHING: 0,
        },
      },
      warnings: [],
    },
    rebalanceRecommendations: view.rebalance.recommendations,
    allocationPlan: null,
    regime,
    risk: view.risk,
    cashShare:
      view.summary.totalValue > 0
        ? view.summary.cashBalance / view.summary.totalValue
        : 0,
    assetClassByTicker: new Map(
      portfolio.holdings.map((h) => [h.ticker, h.assetClass]),
    ),
    policy: profile?.policy ?? null,
    riskTolerance: profile?.riskTolerance ?? null,
  });

  const policyReport = detectPolicyViolations({
    holdings: portfolio.holdings.map((h) => {
      const valuation = view.valuations.find((v) => v.holding.id === h.id);
      const classification =
        classifications.get(h.ticker) ?? {
          instrumentType: "UNKNOWN" as const,
          confidence: "LOW" as const,
          rationale: ["Geen classificatie beschikbaar."],
          metadata: defaultMetadata(),
          classifiedAt: new Date().toISOString(),
        };
      return {
        holding: h,
        marketValueBase: valuation?.marketValueBase ?? 0,
        classification,
      };
    }),
    totalValue: view.summary.totalValue,
    context: {
      userMaxSinglePositionWeight:
        profile?.policy?.maxPositionWeight ?? null,
    },
  });

  const qualityReport = assessPortfolioQuality({
    holdings: portfolio.holdings.map((h) => {
      const valuation = view.valuations.find((v) => v.holding.id === h.id);
      const weight =
        view.summary.totalValue > 0 && valuation
          ? valuation.marketValueBase / view.summary.totalValue
          : 0;
      return {
        holding: h,
        enrichment: enrichments.get(h.ticker) ?? null,
        weight,
      };
    }),
  });

  const riskActions = buildRiskActions({
    risk: view.risk,
    rebalanceRecommendations: view.rebalance.recommendations,
    policyReport,
    qualityReport,
    baseCurrency: view.summary.baseCurrency,
  });

  const briefingContext = buildBriefingContext({
    portfolioId: portfolio.id,
    briefingDate:
      input.briefingDate ?? new Date().toISOString().slice(0, 10),
    view,
    snapshots,
    regime,
    dashboardActions,
    riskActions,
  });

  const briefing = await loadDailyBriefing({
    context: briefingContext,
    forceRefresh: input.forceRefresh,
  });

  // monthlyContribution is geen briefing-input; we gebruiken 'em alleen om
  // toekomstige uitbreiding (bv. "deze maand kun je €X bijstorten") niet
  // te blokkeren. Voorkom unused-warning.
  void monthlyContribution;

  return { briefing, noPortfolio: false };
}
