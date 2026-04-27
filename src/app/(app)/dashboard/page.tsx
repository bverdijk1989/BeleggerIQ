import { LayoutDashboard, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import {
  buildAttentionItems,
  buildPortfolioView,
  buildTaxReport,
  computeTwrYear,
  generateAllocationPlan,
  runDecisionEngine,
} from "@/lib/analytics";
import { computeRegimeScore } from "@/lib/analytics/regime/engine";
import { resolveUserFromServer } from "@/lib/auth";
import { fetchRegimeInputs } from "@/lib/data/regime";
import {
  portfolioRepository,
  portfolioSnapshotRepository,
} from "@/lib/data";

import {
  CurrencyAllocationCard,
  HoldingsAllocationCard,
} from "./components/allocation-cards";
import { BuyPlanPreviewCard } from "./components/buy-plan-preview-card";
import { HistoryCharts } from "./components/history-charts";
import { MarketRegimeCard } from "./components/market-regime-card";
import { NextActionCard } from "./components/next-action-card";
import { TopRisksCard } from "./components/risks-and-opportunities";
import { SnapshotButton } from "./components/snapshot-button";
import { ActionEngineCard } from "./components/action-engine-card";
import { BenchmarkCard } from "./components/benchmark-card";
import { BusinessQualityCards } from "./components/business-quality-cards";
import { NetReturnCard } from "./components/net-return-card";
import { TopKansenCard } from "./components/top-kansen-card";
import { TopStats } from "./components/top-stats";
import { loadBenchmarkReport } from "./load-benchmark";
import { loadBusinessQualityBatch } from "./load-business-quality";
import { loadOpportunityData } from "../kansen/load-opportunity-data";

export const metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

const DEFAULT_BUDGET = 500;

export default async function DashboardPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return <UnauthenticatedState message={auth.error} />;

  const context = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);

  if (!context || !context.portfolio) {
    return <NoPortfolioState />;
  }

  const portfolio = context.portfolio;

  // Parallel fetches: portfolio view + regime + historiek.
  // Allocation plan kan pas daarna (heeft regime + view nodig).
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

  const plan = generateAllocationPlan({
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
  const updatedAt = new Date(view.lastUpdated).toLocaleString("nl-NL");

  // Tax-engine — indicatief netto rendement (box 3 + dividend-tax + WHT).
  // Bruto rendement = TWR over trailing 12m uit snapshots; valt
  // terug op unrealized-PnL-proxy bij <2 snapshots.
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

  // Action & Rebalance Engine — pure rule-based decisions per positie.
  // Hergebruikt rebalance-quantityPlans uit `view.rebalance` zodat de
  // afbouw-aantallen exact matchen met /risico.
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
    })),
    totalValue: view.summary.totalValue,
    cashBalance: view.summary.cashBalance,
    baseCurrency: view.summary.baseCurrency,
    risk: view.risk,
    policy: context.profile?.policy ?? null,
    regime,
    monthlyContribution,
  });

  // Opportunity Radar (top-3) + benchmark/attribution + business quality.
  // Alle drie faal-safe; parallel-fetch deelt market-data cache.
  const [opportunityReport, benchmark, businessQuality] = await Promise.all([
    loadOpportunityData({
      portfolio,
      view,
      userEmail: auth.user.email,
      config: { maxCandidates: 3, minSignalStrength: 40 },
    })
      .then((r) => r.report)
      .catch(() => null),
    loadBenchmarkReport({ portfolio, view })
      .then((r) => r.report)
      .catch(() => null),
    loadBusinessQualityBatch({ portfolio, view }).catch(() => null),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Overzicht"
        title="Dashboard"
        description={`Actiegerichte cockpit voor je portefeuille. Bijgewerkt ${updatedAt}.`}
      />

      <TopStats view={view} regime={regime} />

      <Section
        title="Wat moet ik NU doen?"
        description="Rule-based aanbevelingen per positie + global advies. Alle aantallen komen uit dezelfde engines als /risico."
      >
        <ActionEngineCard plan={actionPlan} limit={3} />
      </Section>

      <NextActionCard items={attention} />

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
        <HoldingsAllocationCard
          positions={view.summary.topPositions}
          baseCurrency={view.summary.baseCurrency}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CurrencyAllocationCard
          slices={view.summary.allocationByCurrency}
          baseCurrency={view.summary.baseCurrency}
          foreignExposure={view.risk.foreignCurrencyExposure}
        />
        <TopRisksCard risk={view.risk} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopKansenCard candidates={opportunityReport?.candidates ?? []} />
        <BuyPlanPreviewCard plan={plan} />
      </div>

      {benchmark && (
        <Section
          title="Benchmark & Attribution"
          description="Performance van je portefeuille vs. een marktbenchmark, met attributie naar sectoren, factoren en individuele posities."
        >
          <BenchmarkCard report={benchmark} />
        </Section>
      )}

      {businessQuality && businessQuality.ranked.length > 0 && (
        <Section
          title="Business quality"
          description="Elke positie als bedrijf beoordeeld — moat, earnings-quality en capital-efficiency. 10-year-hold-indicator op basis van composite + sector + coverage."
        >
          <BusinessQualityCards results={businessQuality.ranked} limit={5} />
        </Section>
      )}

      <Section
        title="Netto rendement"
        description="Indicatieve fiscale impact: box 3 (incl. spaargeld + schulden), NL dividendbelasting en buitenlandse withholding tax. Geen fiscaal advies."
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
        description="Time-series uit opgeslagen snapshots. Draai `Snapshot nu` of de scheduled job om nieuwe punten toe te voegen."
        actions={<SnapshotButton portfolioId={portfolio.id} />}
      >
        <HistoryCharts
          snapshots={snapshots}
          baseCurrency={view.summary.baseCurrency}
        />
      </Section>

      <Section
        title="Over deze cockpit"
        description="Alle cijfers komen uit dezelfde engines als de detailpagina's."
      >
        <div className="rounded-md border border-border/60 bg-surface/60 p-4 text-sm text-muted-foreground">
          Health, risk, market regime en de maandbeslissing lopen synchroon:
          wijzig je filters of policy op de detailpagina&apos;s, dan volgt het
          dashboard automatisch bij de volgende refresh.
        </div>
      </Section>
    </>
  );
}

function NoPortfolioState() {
  return (
    <>
      <PageHeader
        eyebrow="Overzicht"
        title="Dashboard"
        description="Nog geen portefeuille gevonden — draai `npm run prisma:seed` om demo-data te laden."
      />
      <EmptyState
        icon={LayoutDashboard}
        title="Geen portefeuille"
        description="Zodra er holdings zijn, vult het dashboard zich met health, risico, marktregime en je maandbeslissing."
      />
    </>
  );
}

function UnauthenticatedState({ message }: { message: string }) {
  return (
    <>
      <PageHeader
        eyebrow="Overzicht"
        title="Dashboard"
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
