import { Receipt, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { resolveUserFromServer } from "@/lib/auth";
import {
  taxValuationRepository,
  transactionRepository,
} from "@/lib/data";
import { portfolioSnapshotRepository } from "@/lib/data/snapshot-repository";
import { resolveActiveSelection } from "@/lib/portfolios";
import { buildDividendOverview } from "@/lib/tax/dividend-overview";
import { buildTaxCsv } from "@/lib/tax/export-csv";
import { deriveIndicators } from "@/lib/tax/position-indicators";
import {
  deriveRelevantPeilYears,
  resolveYearBoundaries,
} from "@/lib/tax/year-boundary";

import { DisclaimerBanner } from "./components/disclaimer-banner";
import { DividendOverviewTable } from "./components/dividend-overview-table";
import { ExportActions } from "./components/export-actions";
import { PositionIndicatorsList } from "./components/position-indicators-list";
import { ValuationsCard } from "./components/valuations-card";

export const metadata = {
  title: "Belasting",
};

export const dynamic = "force-dynamic";

interface TaxPageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function TaxPage({ searchParams }: TaxPageProps) {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Belasting"
          title="Belasting"
          description="Authenticatie vereist."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Niet ingelogd"
          description={auth.error}
        />
      </>
    );
  }

  const params = await searchParams;
  const selection = await resolveActiveSelection({
    email: auth.user.email,
    searchParams: params,
  });

  if (selection.kind === "all") {
    return (
      <>
        <PageHeader
          eyebrow="Belasting"
          title="Belasting"
          description="Kies een specifieke portefeuille."
        />
        <EmptyState
          icon={Receipt}
          title="Selecteer een portefeuille"
          description="Het belastingoverzicht draait per portefeuille — gebruik de switcher rechtsboven om er één te kiezen."
        />
      </>
    );
  }

  if (selection.kind === "empty") {
    return (
      <>
        <PageHeader
          eyebrow="Belasting"
          title="Belasting"
          description="Geen portefeuille gevonden."
        />
        <EmptyState
          icon={Receipt}
          title="Maak eerst een portefeuille aan"
          description="Voor een belastingoverzicht hebben we minimaal je posities én transactiehistorie nodig."
        />
      </>
    );
  }

  const portfolio = selection.portfolio;

  const [transactions, snapshots, manualValuations] = await Promise.all([
    transactionRepository.list({ portfolioId: portfolio.id }),
    portfolioSnapshotRepository.listForPortfolio(portfolio.id, 365),
    taxValuationRepository.list(portfolio.id),
  ]);

  const earliestTx = transactions.length
    ? transactions
        .map((t) => t.executedAt)
        .reduce((min, d) => (d < min ? d : min), transactions[0]!.executedAt)
    : null;

  const peilYears = deriveRelevantPeilYears({
    earliestTxDate: earliestTx,
    now: new Date(),
  });

  const manualMap = new Map<number, { value: number; asOf: Date }>();
  for (const v of manualValuations) {
    manualMap.set(v.peilYear, { value: v.totalValue, asOf: v.asOf });
  }

  const valuations = resolveYearBoundaries({
    peilYears,
    snapshots: snapshots.map((s) => ({
      capturedAt: new Date(s.capturedAt),
      totalValue: s.totalValue,
    })),
    manualValuations: manualMap,
  });

  const dividendRows = transactions
    .filter((t) => t.type === "DIVIDEND" || t.type === "TAX")
    .map((t) => ({
      id: t.id,
      type: t.type as "DIVIDEND" | "TAX",
      isin: t.isin,
      ticker: t.ticker,
      signedAmount: t.signedAmount,
      currency: t.currency,
      executedAt: t.executedAt,
    }));

  const dividends = buildDividendOverview({ rows: dividendRows });

  const indicators = portfolio.holdings
    .map((h) => {
      const meta = (h.metadata ?? {}) as Record<string, unknown>;
      const policyRaw = meta.distributionPolicy;
      const distributionPolicy =
        policyRaw === "ACCUMULATING" || policyRaw === "DISTRIBUTING"
          ? policyRaw
          : null;
      return {
        ...deriveIndicators({
          ticker: h.ticker,
          isin: h.isin ?? null,
          name: h.name,
          assetClass: h.assetClass,
          distributionPolicy,
        }),
        name: h.name,
      };
    })
    .filter((i) => i.tags.length > 0);

  const csv = buildTaxCsv({
    generatedAt: new Date(),
    baseCurrency: portfolio.baseCurrency ?? "EUR",
    valuations,
    dividends,
  });
  const fileName = `beleggeriq-belasting-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  return (
    <>
      <PageHeader
        eyebrow="Belasting"
        title="Belastingoverzicht"
        description="Peildatum-waarden, dividend-bronbelasting en aandachtspunten — exportbaar voor je accountant."
      />

      <DisclaimerBanner />

      <Section
        title="Export"
        description="Download het overzicht of print 'em direct als PDF."
      >
        <ExportActions csvContent={csv} fileName={fileName} />
      </Section>

      <Section
        title="Box-3 peildatum-waarden"
        description="Eén waarde per kalenderjaar op 1 januari 00:00. Snapshot heeft voorrang; ontbreekt 'ie, dan handmatig invoeren."
      >
        <ValuationsCard
          portfolioId={portfolio.id}
          baseCurrency={portfolio.baseCurrency ?? "EUR"}
          outcomes={valuations}
        />
      </Section>

      <Section
        title="Dividenden + bronbelasting per land"
        description="Bruto dividenduitkering, daadwerkelijk ingehouden bronbelasting, en het deel dat theoretisch via NL-verdragen verrekend kan worden."
      >
        <DividendOverviewTable buckets={dividends} />
      </Section>

      {indicators.length > 0 && (
        <Section
          title="Aandachtspunten per positie"
          description="Posities die fiscaal afwijken — US-dividend, REIT-status, of accumulerende ETFs zonder cash-uitkering."
        >
          <PositionIndicatorsList positions={indicators} />
        </Section>
      )}
    </>
  );
}
