import { TimerReset } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { buildEvidenceReport, runBacktest } from "@/lib/analytics";

import { Disclaimer } from "./components/disclaimer";
import { EquityChart } from "./components/equity-chart";
import { EvidenceTab } from "./components/evidence-tab";
import { FiltersForm } from "./components/filters-form";
import { MetricsCards } from "./components/metrics-cards";
import { TabNav, type BacktestTab } from "./components/tab-nav";
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
  const tab = parseTab(resolvedParams.tab);
  const searchParamsString = stringifyParams(resolvedParams);
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

  // Evidence-report wordt altijd berekend (pure function over equity-curve)
  // zodat tab-switches geen extra fetches nodig hebben.
  const evidenceReport =
    result.equityCurve.length > 0
      ? buildEvidenceReport({
          result,
          strategyLabel: prepared.strategyLabel,
          benchmarkLabel: result.benchmark?.ticker ?? null,
        })
      : null;

  return (
    <>
      <PageHeader
        eyebrow="Onderzoek"
        title="Backtest"
        description={`Strategie: ${prepared.strategyLabel} · ${periodLabel} · ${prepared.members.length} tickers in universum.`}
      />

      <FiltersForm initial={prepared.effectiveFilters} />

      <TabNav current={tab} searchParamsString={searchParamsString} />

      {result.equityCurve.length === 0 ? (
        <EmptyState
          icon={TimerReset}
          title="Te weinig observaties"
          description="De geselecteerde periode leverde niet genoeg maandelijkse data op. Verleng het venster of kies een ander universum."
        />
      ) : tab === "bewijs" && evidenceReport ? (
        <EvidenceTab
          report={evidenceReport}
          baseCurrency={prepared.config.baseCurrency}
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

function parseTab(value: string | string[] | undefined): BacktestTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "bewijs" ? "bewijs" : "headline";
}

function stringifyParams(
  params: Record<string, string | string[] | undefined>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) sp.append(k, item);
    } else {
      sp.set(k, v);
    }
  }
  return sp.toString();
}
