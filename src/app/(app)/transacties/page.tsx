import { Receipt, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository, transactionRepository } from "@/lib/data";
import { resolveActiveSelection } from "@/lib/portfolios";
import { computeYearlySummary } from "@/lib/transactions/summary";

import { ImportTransactionsCard } from "./components/import-transactions-card";
import { TransactionFilters } from "./components/transaction-filters";
import { TransactionsTable } from "./components/transactions-table";
import { YearlySummaryCards } from "./components/yearly-summary-cards";
import type { TxType } from "@/lib/transactions/types";

export const metadata = {
  title: "Transacties",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{
    year?: string;
    type?: string;
    ticker?: string;
  }>;
}

const ALLOWED_TYPES: TxType[] = [
  "BUY",
  "SELL",
  "DIVIDEND",
  "INTEREST",
  "FEE",
  "TAX",
  "CASH",
  "FX",
  "ADJUSTMENT",
];

function parseFilters(params: Awaited<PageProps["searchParams"]>) {
  const yearRaw = params?.year ? Number(params.year) : undefined;
  const year =
    yearRaw && Number.isFinite(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100
      ? yearRaw
      : undefined;
  const typeRaw = params?.type?.toUpperCase();
  const type = typeRaw && ALLOWED_TYPES.includes(typeRaw as TxType)
    ? (typeRaw as TxType)
    : undefined;
  const ticker =
    params?.ticker && /^[A-Za-z0-9.-]{1,16}$/.test(params.ticker)
      ? params.ticker.toUpperCase()
      : undefined;
  return { year, type, ticker };
}

export default async function TransactionsPage(props: PageProps) {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Belasting & analytics"
          title="Transacties"
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

  const params = await props.searchParams;
  const selection = await resolveActiveSelection({
    email: auth.user.email,
    searchParams: params,
  });

  if (selection.kind === "empty") {
    return (
      <>
        <PageHeader
          eyebrow="Belasting & analytics"
          title="Transacties"
          description="Geen portefeuille gevonden."
        />
        <EmptyState
          icon={Receipt}
          title="Maak eerst een portefeuille aan"
          description="Een transactie-historie hangt onder een portefeuille. Importeer eerst je posities op /portfolio."
        />
      </>
    );
  }

  if (selection.kind === "all") {
    return (
      <>
        <PageHeader
          eyebrow="Belasting & analytics"
          title="Transacties"
          description="Kies een specifieke portefeuille."
        />
        <EmptyState
          icon={Receipt}
          title="Selecteer een portefeuille"
          description="Transacties zijn per portefeuille; gebruik de switcher rechtsboven om er één te kiezen."
        />
      </>
    );
  }

  const portfolio = selection.portfolio;
  const filters = parseFilters(params);

  // Volledige history voor de yearly summary (geen filter — anders mis je
  // de cross-year FIFO-context). Aparte filtered query voor de tabel.
  const allTx = await transactionRepository.list({
    portfolioId: portfolio.id,
  });
  const filtered =
    filters.year || filters.type || filters.ticker
      ? await transactionRepository.list({
          portfolioId: portfolio.id,
          year: filters.year,
          type: filters.type,
          ticker: filters.ticker,
        })
      : allTx;

  const summary = computeYearlySummary({
    transactions: allTx.map((t) => ({
      id: t.id,
      type: t.type,
      quantity: t.quantity,
      price: t.price,
      fee: t.fee,
      signedAmount: t.signedAmount,
      currency: t.currency,
      executedAt: t.executedAt,
      ticker: t.ticker,
      isin: t.isin,
    })),
  });

  const tickers = Array.from(
    new Set(allTx.map((t) => t.ticker).filter((t): t is string => !!t)),
  ).sort();
  const years = Array.from(
    new Set(allTx.map((t) => t.executedAt.getUTCFullYear())),
  ).sort((a, b) => b - a);

  const existingExternalIds = allTx
    .map((t) => t.externalId)
    .filter((id): id is string => !!id);

  return (
    <>
      <PageHeader
        eyebrow="Belasting & analytics"
        title="Transacties"
        description="Importeer je broker-historie en bekijk realized PnL, dividenden, fees en belastingen per jaar."
      />

      <Section
        title="Importeren"
        description="Voeg nieuwe broker-rijen toe. Duplicaten worden automatisch overgeslagen."
      >
        <ImportTransactionsCard
          portfolioId={portfolio.id}
          existingExternalIds={existingExternalIds}
        />
      </Section>

      {summary.buckets.length > 0 && (
        <Section
          title="Jaaroverzicht"
          description="Per jaar en valuta — realized PnL via FIFO, dividenden bruto, ingehouden bronbelasting en fees."
        >
          <YearlySummaryCards buckets={summary.buckets} />
        </Section>
      )}

      <Section
        title="Alle transacties"
        description={`${filtered.length} van ${allTx.length} rijen.`}
      >
        <TransactionFilters
          years={years}
          tickers={tickers}
          activeYear={filters.year}
          activeType={filters.type}
          activeTicker={filters.ticker}
        />
        {filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Geen transacties"
            description={
              allTx.length === 0
                ? "Importeer een DEGIRO-CSV om hier mee te beginnen."
                : "Geen rijen voor de huidige filter — pas de filters bovenaan aan."
            }
          />
        ) : (
          <TransactionsTable rows={filtered} />
        )}
      </Section>
    </>
  );
}
