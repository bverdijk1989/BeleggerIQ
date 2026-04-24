import { ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { buildPortfolioView } from "@/lib/analytics";
import { runDefaultScenarios } from "@/lib/analytics/scenario";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";

import { buildAttentionItems } from "./build-attention";
import { AttentionSummary } from "./components/attention-summary";
import {
  ConcentrationOverviewCard,
  CurrencyExposureCard,
  SectorExposureCard,
} from "./components/exposure-cards";
import { RiskPositionsTable } from "./components/risk-positions-table";
import { RiskTopSummary } from "./components/risk-top-summary";
import { ScenarioPanel } from "./components/scenario-panel";
import { TopRiskFlags } from "./components/top-risk-flags";

export const metadata = {
  title: "Risico",
};

export const dynamic = "force-dynamic";

export default async function RisicoPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Analyse"
          title="Risico"
          description="Authenticatie vereist."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(auth.user.email)
    .catch(() => null);

  if (!portfolio) {
    return <NoPortfolioState />;
  }

  const view = await buildPortfolioView(portfolio, {
    includeFundamentals: true,
    includeFactorScores: true,
    topN: 10,
  });

  const { risk, rebalance, valuations, summary } = view;
  const attention = buildAttentionItems(risk, rebalance);
  const scenarios = runDefaultScenarios({
    valuations,
    totalValue: summary.totalValue,
    baseCurrency: summary.baseCurrency,
    cashBalance: summary.cashBalance,
    cashCurrency: summary.baseCurrency,
  });

  const updatedAt = new Date(view.lastUpdated).toLocaleString("nl-NL");

  return (
    <>
      <PageHeader
        eyebrow="Analyse"
        title="Risico"
        description={`Concentratie, valuta, sectorbias en stress-scenario's. Bijgewerkt ${updatedAt}.`}
      />

      <RiskTopSummary risk={risk} attentionCount={attention.length} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ConcentrationOverviewCard risk={risk} />
        <CurrencyExposureCard
          slices={risk.exposures.byCurrency ?? []}
          baseCurrency={summary.baseCurrency}
          foreignExposure={risk.foreignCurrencyExposure}
        />
        <SectorExposureCard
          slices={risk.exposures.bySector}
          topSector={risk.topSector}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <RiskPositionsTable
          positions={risk.positions}
          valuations={valuations}
          baseCurrency={summary.baseCurrency}
        />
        <TopRiskFlags flags={risk.flags} />
      </div>

      <ScenarioPanel
        scenarios={scenarios}
        baseCurrency={summary.baseCurrency}
        currentValue={summary.totalValue}
      />

      <Section
        title="Wat vraagt aandacht"
        description="Gecombineerd uit risk-engine en rebalance-engine."
      >
        <AttentionSummary items={attention} />
      </Section>
    </>
  );
}

function NoPortfolioState() {
  return (
    <>
      <PageHeader
        eyebrow="Analyse"
        title="Risico"
        description="Nog geen portefeuille gevonden — draai `npm run prisma:seed` om demo-data te laden."
      />
      <EmptyState
        icon={ShieldAlert}
        title="Geen portefeuille"
        description="Zodra er holdings zijn, verschijnt hier het risicocentrum."
      />
    </>
  );
}
