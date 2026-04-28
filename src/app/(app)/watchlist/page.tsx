import { Eye, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
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
        title="Watchlist"
        description="Tickers die je volgt — met live quote, composite-score en optionele price-alert per item."
      />

      <Section
        title="Toevoegen"
        description="Snel een nieuwe ticker handmatig toevoegen. Gebruik de screener voor batch-toevoegingen."
      >
        <AddWatchlistForm />
      </Section>

      <Section
        title="Lijst"
        description={
          rows.length === 0
            ? "Je watchlist is leeg."
            : `${rows.length} ${rows.length === 1 ? "ticker" : "tickers"} — klik op een rij voor acties.`
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={Eye}
            title="Nog geen tickers"
            description="Voeg er een toe via het formulier hierboven of vanuit de screener."
          />
        ) : (
          <WatchlistTable rows={rows} />
        )}
      </Section>
    </>
  );
}
