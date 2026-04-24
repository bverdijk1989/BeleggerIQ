import { Briefcase, ShieldAlert, Upload } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Button } from "@/components/ui/button";
import { buildPortfolioView } from "@/lib/analytics";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";

import { buildHoldingRows } from "./build-rows";
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
  });

  const rows = buildHoldingRows(view.summary, view.valuations);
  const updatedAt = new Date(view.lastUpdated).toLocaleString("nl-NL");

  return (
    <>
      <PageHeader
        eyebrow="Analyse"
        title="Portefeuille"
        description={`Actieve portefeuille: ${portfolio.name}. Bijgewerkt op ${updatedAt}.`}
        actions={
          <>
            <ImportDegiroDialog
              portfolioId={portfolio.id}
              portfolioName={portfolio.name}
            />
            <Button size="sm">Positie toevoegen</Button>
          </>
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
