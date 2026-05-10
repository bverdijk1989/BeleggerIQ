import { Eye, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { IntelligenceCard } from "@/components/watchlist/intelligence-card";
import { resolveUserFromServer } from "@/lib/auth";

import { AddWatchlistForm } from "./components/add-watchlist-form";
import { WatchlistTable } from "./components/watchlist-table";
import { loadEnrichedWatchlist } from "./load-watchlist";

export const metadata = {
  title: "Watchlist",
};

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Onderzoek"
          title="Watchlist"
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

  // `loadEnrichedWatchlist` filtert intern op de session-user — geen
  // mogelijkheid voor cross-user-leak via deze page.
  const rows = await loadEnrichedWatchlist(auth.user.email).catch(() => []);

  return (
    <>
      <PageHeader
        eyebrow="Onderzoek"
        title="Watchlist Intelligence"
        description="Per ticker een rijk signaal-pakket — waardering, momentum, dividend, macro-fit, en alternatieven uit jouw universum."
      />

      <Section
        title="Toevoegen"
        description="Snel een nieuwe ticker handmatig toevoegen. Gebruik de screener voor batch-toevoegingen."
      >
        <AddWatchlistForm />
      </Section>

      <Section
        title={
          rows.length === 0
            ? "Lijst"
            : `${rows.length} ${rows.length === 1 ? "ticker" : "tickers"} — intelligence-overzicht`
        }
        description={
          rows.length === 0
            ? "Je watchlist is leeg."
            : "Per ticker: 7 signalen, alternatieven uit je portefeuille en watchlist, en een korte uitleg waarom 'em interessant of risicovol is."
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={Eye}
            title="Nog geen tickers"
            description="Voeg er een toe via het formulier hierboven of vanuit de screener."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {rows.map((row) =>
              row.intelligence ? (
                <IntelligenceCard
                  key={row.item.id}
                  ticker={row.item.ticker}
                  name={row.item.name ?? row.item.ticker}
                  price={row.quote?.price ?? null}
                  currency={row.quote?.currency ?? null}
                  dayChange={row.quote?.changePct ?? null}
                  intelligence={row.intelligence}
                  targetPrice={row.item.targetPrice ?? null}
                  targetPriceHigh={row.item.targetPriceHigh ?? null}
                />
              ) : null,
            )}
          </div>
        )}
      </Section>

      {rows.length > 0 && (
        <Section
          title="Compacte tabel-weergave"
          description="Klassieke tabel met quote, score en target-zone — handig voor batch-acties."
        >
          <WatchlistTable rows={rows} />
        </Section>
      )}
    </>
  );
}
