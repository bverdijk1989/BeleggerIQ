import { LayoutDashboard, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import {
  buildAttentionItems,
  buildPortfolioView,
  generateAllocationPlan,
  runScreen,
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
import {
  TopOpportunitiesCard,
  TopRisksCard,
} from "./components/risks-and-opportunities";
import { SnapshotButton } from "./components/snapshot-button";
import { TopStats } from "./components/top-stats";

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

  // Parallel fetches: portfolio view + regime + screener + historiek.
  // Allocation plan kan pas daarna (heeft regime + view nodig).
  const [view, regimeFetch, screenerResult, snapshots] = await Promise.all([
    buildPortfolioView(portfolio, {
      includeFundamentals: true,
      includeFactorScores: true,
    }),
    fetchRegimeInputs(),
    runScreen({ filters: {}, limit: 3 }),
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

  return (
    <>
      <PageHeader
        eyebrow="Overzicht"
        title="Dashboard"
        description={`Actiegerichte cockpit voor je portefeuille. Bijgewerkt ${updatedAt}.`}
      />

      <TopStats view={view} regime={regime} />

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
        <TopOpportunitiesCard candidates={screenerResult.candidates} />
        <BuyPlanPreviewCard plan={plan} />
      </div>

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
