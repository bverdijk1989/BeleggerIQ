import { Briefcase, ShieldAlert, Upload } from "lucide-react";

import { DataQualityPanel } from "@/components/common/data-quality-panel";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { buildPortfolioView } from "@/lib/analytics";
import { assessPortfolioQuality } from "@/lib/analytics/data-quality";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { enrichInstruments } from "@/lib/data/instrument-enrichment";

import { buildHoldingRows } from "./build-rows";
import { AddPositionDialog } from "./components/add-position-dialog";
import { CashBalanceDialog } from "./components/cash-balance-dialog";
import { HoldingsTable } from "./components/holdings-table";
import { ImportDegiroDialog } from "./components/import-degiro-dialog";
import { PortfolioSummaryCards } from "./components/portfolio-summary-cards";
import { ScoreLegend } from "./components/score-legend";

export const metadata = {
  title: "Portefeuille",
};

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Analyse"
          title="Portefeuille"
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
    topN: 5,
    includeFundamentals: true,
    includeFactorScores: true,
    cashBalance: portfolio.cashBalance,
  });

  const rows = buildHoldingRows(view.summary, view.valuations);
  const updatedAt = new Date(view.lastUpdated).toLocaleString("nl-NL");

  // Data-quality pipeline (server-side, businesslogica uit UI):
  //  1. Enrich elk instrument via Yahoo assetProfile.
  //  2. Bouw het quality-report met weight-weging uit de valuations.
  const enrichments = await enrichInstruments(
    portfolio.holdings.map((h) => ({
      ticker: h.ticker,
      isin: h.isin ?? null,
      name: h.name,
    })),
  ).catch(() => new Map());
  const totalValue = view.summary.totalValue;
  const qualityReport = assessPortfolioQuality({
    holdings: portfolio.holdings.map((h) => {
      const valuation = view.valuations.find(
        (v) => v.holding.id === h.id,
      );
      const weight =
        totalValue > 0 && valuation
          ? valuation.marketValueBase / totalValue
          : 0;
      return {
        holding: h,
        enrichment: enrichments.get(h.ticker) ?? null,
        weight,
      };
    }),
  });

  return (
    <>
      <PageHeader
        eyebrow="Analyse"
        title="Portefeuille"
        description={`Actieve portefeuille: ${portfolio.name}. Bijgewerkt op ${updatedAt}.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <ImportDegiroDialog
              portfolioId={portfolio.id}
              portfolioName={portfolio.name}
            />
            <AddPositionDialog
              portfolioId={portfolio.id}
              portfolioName={portfolio.name}
            />
            <CashBalanceDialog
              portfolioId={portfolio.id}
              baseCurrency={portfolio.baseCurrency}
              currentCash={portfolio.cashBalance}
            />
          </div>
        }
      />

      <PortfolioSummaryCards summary={view.summary} />

      <Section
        title="Holdings"
        description="Factor scores op 0–100 schaal; actiebadge combineert score + datacoverage + gewicht t.o.v. target."
      >
        {rows.length === 0 ? (
          <EmptyHoldingsState
            portfolioId={portfolio.id}
            portfolioName={portfolio.name}
          />
        ) : (
          <HoldingsTable rows={rows} baseCurrency={view.summary.baseCurrency} />
        )}
      </Section>

      {rows.length > 0 && (
        <Section
          title="Data-kwaliteit"
          description="Hoeveel van je posities hebben complete sector-, regio- en asset-class data. Lage confidence betekent: het signaal is er, maar bouwt op onvolledige input."
        >
          <DataQualityPanel report={qualityReport} />
        </Section>
      )}

      <Section title="Legenda" description="Zo lees je de scores en acties.">
        <ScoreLegend />
      </Section>

      {view.health.signals.length > 0 && (
        <Section
          title="Signalen"
          description="Aandachtspunten afgeleid uit je portefeuille-metrics."
        >
          <ul className="space-y-2">
            {view.health.signals.map((signal) => (
              <li
                key={signal.code}
                className="flex items-start gap-3 rounded-md border border-border/60 bg-surface/60 p-3 text-sm"
              >
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${severityDot(signal.severity)}`}
                />
                <div>
                  <p className="font-medium text-foreground">{signal.label}</p>
                  <p className="text-muted-foreground">{signal.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function severityDot(
  severity: "positive" | "info" | "warning" | "critical",
): string {
  switch (severity) {
    case "positive":
      return "bg-success";
    case "info":
      return "bg-primary";
    case "warning":
      return "bg-warning";
    case "critical":
      return "bg-destructive";
  }
}

function NoPortfolioState() {
  return (
    <>
      <PageHeader
        eyebrow="Analyse"
        title="Portefeuille"
        description="Nog geen portefeuille gevonden — draai `npm run prisma:seed` of maak er één aan."
      />
      <EmptyState
        icon={Briefcase}
        title="Geen portefeuille"
        description="Seed de database of koppel een user aan deze app om holdings te beheren."
      />
    </>
  );
}

function EmptyHoldingsState({
  portfolioId,
  portfolioName,
}: {
  portfolioId: string;
  portfolioName: string;
}) {
  return (
    <EmptyState
      icon={Upload}
      title="Nog geen holdings"
      description="Upload je DEGIRO portefeuille-export om in één klik te starten met live data en factor scores."
      action={
        <ImportDegiroDialog
          portfolioId={portfolioId}
          portfolioName={portfolioName}
        />
      }
    />
  );
}
