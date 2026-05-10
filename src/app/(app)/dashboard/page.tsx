import { LayoutDashboard, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import {
  AiExplainPanel,
  AllocationDecisionPreview,
  BriefingCard,
  BusinessQualityBlock,
  buildCockpitViewModel,
  DecisionCockpitLayout,
  DecisionHistoryPreview,
  HealthScoreCard,
  OpportunityPanel,
  PortfolioStatusSnapshot,
  PrimaryActionBar,
  RiskActionPanel,
  ScenarioSnapshot,
} from "@/components/dashboard/decision-cockpit";
import {
  buildAttentionItems,
  buildDashboardPrimaryActions,
  buildDecisionSnapshots,
  buildPortfolioStatusSnapshot,
  buildPortfolioView,
  buildRiskActions,
  buildScenarioSnapshot,
  buildTaxReport,
  classifyInstruments,
  computeTwrYear,
  defaultMetadata,
  detectPolicyViolations,
  generateAllocationPlan,
  prioritizeOpportunities,
  runDecisionEngine,
  runMacroScenarios,
  simulateActionImpact,
  summarizeBusinessQuality,
  summarizeDecisionHistory,
} from "@/lib/analytics";
import { capForHolding } from "@/lib/analytics/policy-engine/holding-cap";
import { explainDashboardSummary } from "@/lib/ai";
import { assessPortfolioQuality } from "@/lib/analytics/data-quality";
import {
  buildBriefingContext,
  loadDailyBriefing,
} from "@/lib/ai/briefing";
import { loadBehavioralCoach } from "@/lib/analytics/behavioral";
import { loadGoalsForUser } from "@/lib/analytics/goals";
import { loadPortfolioHealthScore } from "@/lib/analytics/health-score";
import { CoachCard } from "@/components/behavioral/coach-card";
import { GoalsSummaryCard } from "@/components/goals/goals-summary-card";
import { computeRegimeScore } from "@/lib/analytics/regime/engine";
import { resolveUserFromServer } from "@/lib/auth";
import { fetchRegimeInputs } from "@/lib/data/regime";
import { enrichInstruments } from "@/lib/data/instrument-enrichment";
import {
  decisionHistoryRepository,
  portfolioRepository,
  portfolioSnapshotRepository,
} from "@/lib/data";
import {
  aggregatePortfolios,
  resolveActiveSelection,
} from "@/lib/portfolios";

import { AggregateDashboard } from "./components/aggregate-dashboard";
import { BenchmarkCard } from "./components/benchmark-card";
import { HistoryCharts } from "./components/history-charts";
import { MarketRegimeCard } from "./components/market-regime-card";
import { NetReturnCard } from "./components/net-return-card";
import { SnapshotButton } from "./components/snapshot-button";
import { loadBenchmarkReport } from "./load-benchmark";
import { loadBusinessQualityBatch } from "./load-business-quality";
import { loadOpportunityData } from "../kansen/load-opportunity-data";

export const metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

const DEFAULT_BUDGET = 500;

/**
 * Decision Cockpit dashboard.
 *
 * Bovenaan (above-the-fold) staat de PrimaryActionBar + Portfolio
 * Status zodat de gebruiker binnen ~5 seconden ziet:
 *   1. wat hij nu moet doen
 *   2. waarom (engine-rationale)
 *   3. wat de impact is (urgency + cijfers)
 *
 * Daaronder volgt de details-laag (risico's / kansen / allocatie /
 * scenario / AI-explain) en de "Verdieping"-sectie met diepere kaarten
 * (benchmark, business-quality, netto rendement, historiek).
 *
 * Alle businesslogica zit in `@/lib/analytics`-engines + `buildCockpitViewModel`;
 * de page-level component doet alleen I/O + rendering.
 */
interface DashboardPageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return <UnauthenticatedState message={auth.error} />;

  const params = await searchParams;
  const selection = await resolveActiveSelection({
    email: auth.user.email,
    searchParams: params,
  });

  if (selection.kind === "empty") {
    return <NoPortfolioState />;
  }

  // Aggregate-mode: simpele KPIs + per-portfolio breakdown.
  if (selection.kind === "all") {
    const result = aggregatePortfolios(selection.portfolios);
    return (
      <>
        <PageHeader
          eyebrow="Overzicht"
          title="Decision Cockpit"
          description="Aggregaat over al je portefeuilles."
        />
        <AggregateDashboard
          result={result}
          buildHref={(id) => `/dashboard?p=${id}`}
        />
      </>
    );
  }

  const ctxLoaded = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);

  // `findUserContextByEmail` levert profile/contribution; de feitelijke
  // portefeuille komt uit de selectie. Als de context-fetch faalt (DB
  // hick-up) gebruiken we lege defaults — beter degraded UI dan crash.
  const context = ctxLoaded ?? {
    userId: "",
    portfolio: null,
    profile: null,
    monthlyContribution: null,
  };
  const portfolio = selection.portfolio;

  // Parallel fetches: portfolio view + regime + historiek.
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

  const monthlyContribution =
    context.monthlyContribution !== null
      ? context.monthlyContribution
      : DEFAULT_BUDGET;

  const allocationPlan = generateAllocationPlan({
    portfolioId: portfolio.id,
    baseCurrency: view.summary.baseCurrency,
    valuations: view.valuations,
    totalValue: view.summary.totalValue,
    cashBalance: view.summary.cashBalance,
    monthlyContribution,
    policy: context.profile?.policy ?? null,
    objective: context.profile?.objective ?? "BALANCED",
    regime,
  });

  const attention = buildAttentionItems(view.risk, view.rebalance);

  // Tax-engine — TWR-jaar als bruto-return; fallback proxy.
  const twrYear = computeTwrYear({ snapshots });
  const fallbackReturn =
    view.summary.totalValue > 0 && view.summary.unrealizedPnl !== undefined
      ? view.summary.unrealizedPnl / view.summary.totalValue
      : 0;
  const grossReturnFraction = twrYear ?? fallbackReturn;
  const taxReport = buildTaxReport({
    holdings: portfolio.holdings,
    marketValueByTicker: new Map(
      view.valuations.map((v) => [v.holding.ticker, v.marketValueBase]),
    ),
    portfolioValue: view.summary.totalValue,
    grossReturnFraction,
    hasFiscalPartner: context.profile?.hasFiscalPartner ?? false,
    cashWealth: context.profile?.cashWealthEur ?? 0,
    debtWealth: context.profile?.debtWealthEur ?? 0,
  });

  // Instrument-classifications eerst — deze drijven de type-bewuste
  // positie-caps in de action-engine. BROAD_MARKET_ETF krijgt 60% i.p.v.
  // de oude flat 10%, zodat een Vanguard S&P 500 op 30% géén vals SELL
  // signaal triggert.
  const enrichmentsForCap = await enrichInstruments(
    portfolio.holdings.map((h) => ({
      ticker: h.ticker,
      isin: h.isin ?? null,
      name: h.name,
    })),
  ).catch(() => new Map());
  const classificationsForCap = classifyInstruments({
    items: portfolio.holdings.map((h) => ({
      holding: h,
      enrichment: enrichmentsForCap.get(h.ticker) ?? null,
    })),
  });
  const instrumentLimitsByTicker = new Map<
    string,
    { allowedMaxWeight: number; runMultiplier: number }
  >();
  for (const [ticker, classification] of classificationsForCap) {
    const limit = capForHolding({
      classification,
      policy: {
        userMaxSinglePositionWeight: context.profile?.policy?.maxPositionWeight,
      },
    });
    if (limit && Number.isFinite(limit.allowedMaxWeight)) {
      instrumentLimitsByTicker.set(ticker, {
        allowedMaxWeight: limit.allowedMaxWeight,
        runMultiplier: limit.runMultiplier,
      });
    }
  }

  // Action & Rebalance Engine — pure rule-based decisions per positie.
  const quantityPlanByTicker = new Map(
    view.rebalance.recommendations.map((r) => [r.ticker, r.quantityPlan]),
  );
  const positionRiskByTicker = new Map(
    view.risk.positions.map((p) => [p.ticker, p]),
  );
  const actionPlan = runDecisionEngine({
    positions: view.valuations.map((v) => ({
      holding: v.holding,
      currentWeight:
        view.summary.totalValue > 0
          ? v.marketValueBase / view.summary.totalValue
          : 0,
      marketValueBase: v.marketValueBase,
      unitPriceBase: v.unitPrice ?? null,
      factorScore: v.holding.factorScore ?? null,
      positionRisk: positionRiskByTicker.get(v.holding.ticker) ?? null,
      quantityPlan: quantityPlanByTicker.get(v.holding.ticker) ?? null,
      instrumentLimit: instrumentLimitsByTicker.get(v.holding.ticker) ?? null,
    })),
    totalValue: view.summary.totalValue,
    cashBalance: view.summary.cashBalance,
    baseCurrency: view.summary.baseCurrency,
    risk: view.risk,
    policy: context.profile?.policy ?? null,
    regime,
    monthlyContribution,
  });

  // Macro-scenarios voor de cockpit-snapshot.
  const macroScenarios = runMacroScenarios({
    positions: view.valuations.map((v) => ({
      holding: v.holding,
      marketValueBase: v.marketValueBase,
    })),
    totalValue: view.summary.totalValue,
    baseCurrency: view.summary.baseCurrency,
  });

  // Opportunity Radar (top-3) + benchmark/attribution + business quality.
  const [opportunityReport, benchmark, businessQuality] = await Promise.all([
    loadOpportunityData({
      portfolio,
      view,
      userEmail: auth.user.email,
      config: { maxCandidates: 5, minSignalStrength: 40 },
    })
      .then((r) => r.report)
      .catch(() => null),
    loadBenchmarkReport({ portfolio, view })
      .then((r) => r.report)
      .catch(() => null),
    loadBusinessQualityBatch({ portfolio, view }).catch(() => null),
  ]);

  // Dashboard primary actions — pure aggregator over alle engines.
  // Levert max 3 zeer concrete acties zoals "Verkoop 1 aandeel
  // Rheinmetall" / "Koop deze maand €300 ASML".
  const assetClassByTicker = new Map(
    portfolio.holdings.map((h) => [h.ticker, h.assetClass]),
  );
  const dashboardActions = buildDashboardPrimaryActions({
    actionPlan,
    rebalanceRecommendations: view.rebalance.recommendations,
    allocationPlan,
    regime,
    risk: view.risk,
    cashShare:
      view.summary.totalValue > 0
        ? view.summary.cashBalance / view.summary.totalValue
        : 0,
    assetClassByTicker,
    policy: context.profile?.policy ?? null,
    riskTolerance: context.profile?.riskTolerance ?? null,
  });

  // ============================================================
  //  View-model voor de cockpit (pure mapping, geen rekenwerk)
  // ============================================================
  const cockpit = buildCockpitViewModel({
    view,
    actionPlan,
    attention,
    opportunities: opportunityReport?.candidates ?? [],
    allocationPlan,
    monthlyContribution,
    benchmark,
    businessRanked: businessQuality?.ranked ?? [],
    taxReport,
    scenarios: macroScenarios,
    regime,
  });

  // Compacte 5-kaart status-snapshot (TOTAL_VALUE, HEALTH, VS_BENCHMARK,
  // NET_RETURN, MARKET_REGIME). Pure aggregator over de bestaande
  // analytics-output — geen extra I/O.
  const statusSnapshot = buildPortfolioStatusSnapshot({
    summary: view.summary,
    health: view.health,
    risk: view.risk,
    benchmark,
    tax: taxReport,
    regime,
  });

  // Portfolio Health Score (Module 1) — 10-component score met
  // verbeteradviezen. Loader hergebruikt view + regime + snapshots; geen
  // extra I/O. Detail-pagina op /portfolio-health.
  const healthScore = loadPortfolioHealthScore({
    view,
    regime,
    snapshots,
    profile: context.profile,
    policy: context.profile?.policy ?? null,
  });

  // (Daily Briefing wordt onderaan gerenderd — heeft riskActions nodig
  //  die verderop in de page-flow worden gebouwd.)

  // Risk actions — combineert risk-engine flags, rebalance-quantity-engine,
  // policy-engine violations en data-quality. Levert max 3 actiegerichte
  // risico-kaarten met letterlijke shares/euro's uit de quantity-engine.
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
        context.profile?.policy?.maxPositionWeight ?? null,
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

  // Behavioral Coach (Module 3) — detecteert 8 gedragspatronen en
  // serveert coaching-vragen + dismiss/snooze-state.
  const coachResult = await loadBehavioralCoach({ userEmail: auth.user.email });

  // Financial Goals (Module 4) — alle actieve doelen + projectie.
  const goalsResult = await loadGoalsForUser({ userEmail: auth.user.email });

  // Daily Briefing (Module 2) — context-aggregator + AI-of-fallback +
  // 12u-cache. Pure server-side; geen extra I/O.
  const briefingContext = buildBriefingContext({
    portfolioId: portfolio.id,
    briefingDate: new Date().toISOString().slice(0, 10),
    view,
    snapshots,
    regime,
    dashboardActions,
    riskActions,
  });
  const briefing = await loadDailyBriefing({ context: briefingContext });

  // Opportunity prioritizer — top 3 dashboard-kansen op basis van de
  // Opportunity Radar, met portfolio-weight + regime-aware rerank en
  // een NL-actie ("onderzoeken" / "kleine bijkoop overwegen" /
  // "wachten op target"). Pure aggregator; geen extra I/O.
  const portfolioWeights = new Map<string, number>(
    view.summary.totalValue > 0
      ? view.valuations.map((v) => [
          v.holding.ticker,
          v.marketValueBase / view.summary.totalValue,
        ])
      : [],
  );
  const factorScoresMap = new Map(
    view.valuations
      .filter((v) => v.holding.factorScore != null)
      .map((v) => [v.holding.ticker, v.holding.factorScore!]),
  );
  const dashboardOpportunities = prioritizeOpportunities({
    candidates: opportunityReport?.candidates ?? [],
    regime,
    portfolioWeights,
    factorScores: factorScoresMap,
  });

  // Action-impact simulator — "wat gebeurt er als ik dit advies volg?".
  // Pure aggregator: muteert valuations + cash op basis van de
  // dashboard-actions, herbouwt allocatie/concentratie/valuta-snapshots
  // vóór/na en levert top-3 impact-deltas. Geen orders, geen broker.
  const actionImpact = simulateActionImpact({
    baseCurrency: view.summary.baseCurrency,
    holdings: portfolio.holdings,
    valuations: view.valuations,
    cashBalance: view.summary.cashBalance,
    dashboardActions,
    rebalanceRecommendations: view.rebalance.recommendations,
    allocationPlan,
  });

  // Business Quality summary — Buffett-laag voor het dashboard. Pure
  // aggregator over de bestaande Business Quality Layer-output, met
  // weight + label-bucketing in NL ("Sterk bedrijf" / "Cyclisch" /
  // "Speculatief" / "Langetermijnhouder").
  // AI Explain — pure deterministische dashboard-samenvatting. Geen
  // LLM-call; legt alleen uit wat de bovenliggende engines al hebben
  // besloten. Komt onderaan de cockpit en is collapsed by default.
  const explainerDataQualityNotes: string[] = [];
  if (qualityReport.unknownSectorWeight >= 0.10) {
    explainerDataQualityNotes.push(
      `${(qualityReport.unknownSectorWeight * 100).toFixed(0)}% van de portefeuille mist sector-data — beïnvloedt risk- en factor-output.`,
    );
  }
  if (policyReport.violations.some((v) => v.violationSeverity === "critical")) {
    explainerDataQualityNotes.push(
      "Eén of meer policy-overschrijdingen in 'critical'-staat — controleer position-caps.",
    );
  }
  const overallExplainerConfidence = (() => {
    const candidates: number[] = [];
    if (dashboardActions.length > 0) {
      candidates.push(
        dashboardActions.reduce((s, a) => s + a.confidence, 0) /
          dashboardActions.length,
      );
    }
    if (riskActions.length > 0) {
      candidates.push(
        riskActions.reduce((s, r) => s + r.confidence, 0) /
          riskActions.length,
      );
    }
    if (candidates.length === 0) return 0.5;
    return candidates.reduce((s, c) => s + c, 0) / candidates.length;
  })();
  const dashboardExplanation = explainDashboardSummary({
    topActions: dashboardActions,
    topRisks: riskActions,
    topOpportunities: dashboardOpportunities,
    regime,
    dataQualityNotes: explainerDataQualityNotes,
    overallConfidence: overallExplainerConfidence,
  });

  // Scenario-snapshot — compact "Wat als…"-blok. Pure aggregator boven
  // de bestaande macro-engine. Defensief-regime kaart wordt deterministisch
  // afgeleid; ui rekent niets.
  const scenarioSnapshot = buildScenarioSnapshot({
    macroReport: macroScenarios,
    regime,
    riskTolerance: context.profile?.riskTolerance ?? null,
    foreignCurrencyWeight:
      actionImpact.currentCurrencyExposure.foreignCurrencyWeight,
  });

  const businessQualitySummary = businessQuality
    ? summarizeBusinessQuality({
        results: businessQuality.ranked,
        holdings: portfolio.holdings,
        factorScores: factorScoresMap,
        marketValueByTicker: new Map(
          view.valuations.map((v) => [v.holding.ticker, v.marketValueBase]),
        ),
        totalValue: view.summary.totalValue,
      })
    : null;

  // Decision History — log advies-snapshots én bouw de UI-summary.
  // Pure aggregator + idempotent upsert: dashboard-loads in hetzelfde
  // uur produceren geen duplicaten.
  const decisionSnapshotsToWrite = buildDecisionSnapshots({
    actions: dashboardActions,
    baseCurrency: view.summary.baseCurrency,
  });
  let decisionRecords: Awaited<
    ReturnType<typeof decisionHistoryRepository.listForUser>
  > = [];
  try {
    await decisionHistoryRepository.upsertMany(
      context.userId,
      portfolio.id,
      decisionSnapshotsToWrite,
    );
    await decisionHistoryRepository.reapExpired();
    decisionRecords = await decisionHistoryRepository.listForUser(
      context.userId,
      { limit: 25 },
    );
  } catch {
    // Persistence is best-effort op het dashboard — een gefaalde
    // upsert mag de cockpit niet breken.
    decisionRecords = [];
  }
  const decisionHistorySummary = summarizeDecisionHistory({
    records: decisionRecords,
  });

  return (
    <>
      <DecisionCockpitLayout
        header={
          <PageHeader
            eyebrow="Overzicht"
            title="Decision Cockpit"
            description={`Wat doe je nu, waarom, en wat is de impact? Bijgewerkt ${cockpit.asOfLabel}.`}
          />
        }
        primaryAction={
          <PrimaryActionBar
            actions={dashboardActions}
            baseCurrency={cockpit.baseCurrency}
          />
        }
        status={<PortfolioStatusSnapshot snapshot={statusSnapshot} />}
        health={<HealthScoreCard score={healthScore} />}
        risks={<RiskActionPanel actions={riskActions} />}
        opportunities={<OpportunityPanel opportunities={dashboardOpportunities} />}
        allocation={
          <AllocationDecisionPreview
            simulation={actionImpact}
            baseCurrency={cockpit.baseCurrency}
          />
        }
        scenario={
          <ScenarioSnapshot
            snapshot={scenarioSnapshot}
            baseCurrency={cockpit.baseCurrency}
          />
        }
        aiExplain={<AiExplainPanel explanation={dashboardExplanation} />}
      />

      <Section
        title="Dagelijkse briefing"
        description="Persoonlijke analist-memo — kort, concreet, hedged taal. Lees de volledige 7-secties op /briefing."
      >
        <BriefingCard briefing={briefing} />
      </Section>

      <Section
        title="Behavioral coach"
        description="Coachende reflecties op je gedrag — concentratie, handelsfrequentie, panic/FOMO, drift. Geen advies, wel vragen."
      >
        <CoachCard report={coachResult.report} signals={coachResult.signals} />
      </Section>

      <Section
        title="Financiële doelen"
        description="Wat betekent je portefeuille voor jouw leven? Pensioen, FIRE, huis, studie — koppel ze aan je strategie."
      >
        <GoalsSummaryCard combined={goalsResult.combined} />
      </Section>

      <Section
        title="Adviesgeschiedenis"
        description="Welke adviezen heeft de cockpit eerder gegeven en wat heb je ermee gedaan? Markeer als 'Gedaan' of 'Genegeerd' zodra je de actie afhandelt."
      >
        <DecisionHistoryPreview
          summary={decisionHistorySummary}
          baseCurrency={cockpit.baseCurrency}
        />
      </Section>

      <Section
        title="Verdieping"
        description="Achtergrond bij je cockpit — marktregime, vergelijking met de index, bedrijfskwaliteit en netto rendement. Niet nodig voor je beslissing van vandaag."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <MarketRegimeCard
            regime={
              regime ?? {
                asOf: new Date().toISOString(),
                score: 50,
                stance: "NEUTRAL",
                confidence: 0,
                narrative: "Geen marktdata beschikbaar.",
                subDrivers: [],
              }
            }
          />
          {benchmark ? (
            <BenchmarkCard report={benchmark} />
          ) : (
            <EmptyState
              icon={ShieldAlert}
              title="Geen benchmark-data"
              description="Benchmark-fetch faalde of leverde te weinig observaties."
            />
          )}
        </div>
      </Section>

      {businessQualitySummary && (
        <Section
          title="Bedrijfskwaliteit"
          description="Elke positie als bedrijf beoordeeld — sterke bedrijven, cyclische blootstellingen en 10-jaars-houders in één overzicht."
        >
          <BusinessQualityBlock summary={businessQualitySummary} />
        </Section>
      )}

      <Section
        title="Netto rendement"
        description="Wat houd je over na belasting? Schatting voor box 3 (inclusief spaargeld + schulden), NL dividendbelasting en buitenlandse bronbelasting. Geen fiscaal advies."
      >
        <NetReturnCard
          report={taxReport}
          grossReturnSource={
            twrYear !== null
              ? "TWR_12M"
              : grossReturnFraction !== 0
                ? "UNREALIZED_PROXY"
                : "ZERO"
          }
        />
      </Section>

      <Section
        title="Historiek"
        description="Hoe ontwikkelt je portefeuille zich? Druk op 'Snapshot nu' of laat de geplande job dit dagelijks doen."
        actions={<SnapshotButton portfolioId={portfolio.id} />}
      >
        <HistoryCharts
          snapshots={snapshots}
          baseCurrency={view.summary.baseCurrency}
        />
      </Section>
    </>
  );
}

function NoPortfolioState() {
  return (
    <>
      <PageHeader
        eyebrow="Overzicht"
        title="Decision Cockpit"
        description="Nog geen portefeuille gevonden — draai `npm run prisma:seed` om demo-data te laden."
      />
      <EmptyState
        icon={LayoutDashboard}
        title="Geen portefeuille"
        description="Zodra er holdings zijn, vult de cockpit zich met je primary action, status, risico's en kansen."
      />
    </>
  );
}

function UnauthenticatedState({ message }: { message: string }) {
  return (
    <>
      <PageHeader
        eyebrow="Overzicht"
        title="Decision Cockpit"
        description="Authenticatie vereist om je cockpit te laden."
      />
      <EmptyState
        icon={ShieldAlert}
        title="Niet ingelogd"
        description={message}
      />
    </>
  );
}
