import { TimerReset } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { runBacktest } from "@/lib/analytics";

import { Disclaimer } from "./components/disclaimer";
import { EquityChart } from "./components/equity-chart";
import { FiltersForm } from "./components/filters-form";
import { MetricsCards } from "./components/metrics-cards";
import { parseBacktestFilters } from "./filters-serde";
import { prepareBacktestInputs } from "./prepare-inputs";

export const metadata = {
  title: "Backtest",
};

export const dynamic = "force-dynamic";

interface BacktestPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BacktestPage({
  searchParams,
}: BacktestPageProps) {
  const resolvedParams = await searchParams;
  const filters = parseBacktestFilters(resolvedParams);
  const prepared = await prepareBacktestInputs(filters).catch((error) => {
    console.error("[backtest:page] prepare failed", error);
    return null;
  });

  if (!prepared) {
    return (
      <>
        <PageHeader
          eyebrow="Onderzoek"
          title="Backtest"
          description="Historische simulatie van strategieën."
        />
        <FiltersForm initial={filters} />
        <EmptyState
          icon={TimerReset}
          title="Geen data beschikbaar"
          description="Het backtest-universum kon niet geladen worden. Controleer de market-data provider of probeer een andere periode."
        />
        <Disclaimer />
      </>
    );
  }

  const result = runBacktest({
    config: prepared.config,
    strategy: prepared.strategy,
    members: prepared.members,
    benchmark: prepared.benchmark,
  });

  const periodLabel = `${prepared.config.startDate} tot ${prepared.config.endDate}`;

  return (
    <>
      <PageHeader
        eyebrow="Onderzoek"
        title="Backtest"
        description={`Strategie: ${prepared.strategyLabel} · ${periodLabel} · ${prepared.members.length} tickers in universum.`}
      />

      <FiltersForm initial={prepared.effectiveFilters} />

      {result.equityCurve.length === 0 ? (
        <EmptyState
          icon={TimerReset}
          title="Te weinig observaties"
          description="De geselecteerde periode leverde niet genoeg maandelijkse data op. Verleng het venster of kies een ander universum."
        />
      ) : (
        <>
          <Section
            title="Headline metrics"
            description="Gemeten op maandelijkse observaties; annualisatie via √12."
          >
            <MetricsCards result={result} />
          </Section>

          <Section title="Performance curve" description="Portefeuille-waarde over tijd.">
            <EquityChart result={result} strategyLabel={prepared.strategyLabel} />
          </Section>
        </>
      )}

      <Section title="Voorwaarden" description="Belangrijke context bij deze cijfers.">
        <Disclaimer />
      </Section>
    </>
  );
}
