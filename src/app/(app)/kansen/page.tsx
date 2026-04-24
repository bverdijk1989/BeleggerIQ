import { Sparkles, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { buildPortfolioView } from "@/lib/analytics";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";

import { loadMispricingReport } from "@/lib/analytics/mispricing/load";

import { HuntingListCard } from "./components/hunting-list-card";
import { MispricingCard } from "./components/mispricing-card";
import { OpportunityList } from "./components/opportunity-list";
import { SignalDistributionCard } from "./components/signal-distribution-card";
import { SourcesScannedCard } from "./components/sources-scanned-card";
import { loadHuntingListReport } from "./load-hunting-list";
import { loadOpportunityData } from "./load-opportunity-data";

export const metadata = {
  title: "Kansen",
};

export const dynamic = "force-dynamic";

/**
 * /kansen — Opportunity Radar pagina.
 *
 * Toont systematische signalen over drie bronnen (portefeuille, screener,
 * watchlist) zonder trade-beslissingen te nemen. Elke kandidaat heeft een
 * composite score, confidence tier en expliciete rationale + keerzijde.
 *
 * Design-uitgangspunten:
 *  - Deterministisch: identieke input → identieke output (geen AI als decider).
 *  - Explainable: elke signal-card toont rationale én risicoNote.
 *  - Pure engine: pagina doet alleen I/O + rendering; rekenwerk zit in
 *    `scanOpportunities` (opportunity-radar/engine.ts).
 */
export default async function KansenPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Onderzoek"
          title="Kansen"
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

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(auth.user.email)
    .catch(() => null);

  if (!portfolio) {
    return <NoPortfolioState />;
  }

  const view = await buildPortfolioView(portfolio, {
    includeFundamentals: true,
    includeFactorScores: true,
  });

  // Parallelle scans: radar + mispricing + hunting-list hangen allebei
  // van dezelfde market-data cache af; parallel-fetch halveert round-trip.
  const [{ report }, mispricing, hunting] = await Promise.all([
    loadOpportunityData({
      portfolio,
      view,
      userEmail: auth.user.email,
      config: { minSignalStrength: 40, maxCandidates: 20 },
    }),
    loadMispricingReport({
      universeLimit: 40,
      maxCandidates: 10,
      minScore: 40,
      signalTtlDays: 30,
    }).catch(() => null),
    loadHuntingListReport({
      userEmail: auth.user.email,
    }).catch(() => null),
  ]);

  const scannedAt = new Date(report.scannedAt).toLocaleString("nl-NL");

  return (
    <>
      <PageHeader
        eyebrow="Onderzoek"
        title="Kansen"
        description={`Systematische radar over portefeuille, screener en watchlist. Geen adviezen — alleen signalen met expliciete rationale. Laatste scan ${scannedAt}.`}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <HeaderStats
          candidateCount={report.candidateCount}
          totalSignals={Object.values(report.signalDistribution).reduce(
            (sum, n) => sum + n,
            0,
          )}
          sourcesScanned={report.sourcesScanned}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Section
          title="Top kansen"
          description="Gerangschikt op composite score. Meerdere signalen op dezelfde ticker geven een diversity-bonus."
        >
          <OpportunityList candidates={report.candidates} />
        </Section>
        <div className="flex flex-col gap-4">
          <SignalDistributionCard report={report} />
          <SourcesScannedCard report={report} />
        </div>
      </div>

      {hunting && (
        <Section
          title="Hunting list"
          description="Watchlist + triggers: target-zone, valuation-band, severity en automatische signal-expiry met opportunity-history."
        >
          <HuntingListCard report={hunting.report} />
        </Section>
      )}

      {mispricing && (
        <Section
          title="Mispricing scanner"
          description="Structurele prijs/kans-afwijkingen met verwachte holding-periode, data-quality eisen en automatische vervaldatum."
        >
          <MispricingCard report={mispricing.report} />
        </Section>
      )}

      <Section
        title="Hoe lees je deze pagina"
        description="De radar markeert situaties — hij beslist niet."
      >
        <div className="space-y-3 rounded-md border border-border/60 bg-surface/60 p-4 text-sm text-muted-foreground">
          <p>
            Elke kandidaat krijgt één of meer <strong>signalen</strong> uit acht
            detectoren (kwaliteit-pullback, value-dislocatie, momentum-keerpunt,
            watchlist-target, onderwogen conviction, core-ETF rebalance,
            defensieve koopje, earnings/sentiment placeholder). De{" "}
            <strong>composite score</strong> is het sterkste signaal
            vermenigvuldigd met een diversity-bonus (max +25% bij vijf of meer
            signalen).
          </p>
          <p>
            Elke signaal-card toont een expliciete <strong>keerzijde</strong> —
            hier kan het misgaan. Dat is opzettelijk: de tool wil je laten
            beslissen op basis van volledige informatie, niet met false
            confidence.
          </p>
          <p>
            <strong>Geen orderadvies.</strong> Dit is geen koop- of verkoopsignaal,
            maar een triage-pagina: &ldquo;welke namen verdienen dat ik ze bekijk
            voor mijn volgende maandbeslissing.&rdquo;
          </p>
        </div>
      </Section>
    </>
  );
}

// ============================================================
//  Subcomponents
// ============================================================

function HeaderStats({
  candidateCount,
  totalSignals,
  sourcesScanned,
}: {
  candidateCount: number;
  totalSignals: number;
  sourcesScanned: {
    portfolioHoldings: number;
    screenerCandidates: number;
    watchlistItems: number;
  };
}) {
  const { portfolioHoldings, screenerCandidates, watchlistItems } =
    sourcesScanned;
  const universe = portfolioHoldings + screenerCandidates + watchlistItems;
  return (
    <>
      <StatCard
        label="Kandidaten"
        value={candidateCount.toString()}
        helper={`uit ${universe} gescande items`}
      />
      <StatCard
        label="Actieve signalen"
        value={totalSignals.toString()}
        helper="som over alle kandidaten"
      />
      <StatCard
        label="Bronnen"
        value={`${portfolioHoldings} / ${screenerCandidates} / ${watchlistItems}`}
        helper="portfolio / screener / watchlist"
      />
    </>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/60 p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl tabular-nums text-foreground">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function NoPortfolioState() {
  return (
    <>
      <PageHeader
        eyebrow="Onderzoek"
        title="Kansen"
        description="Nog geen portefeuille gevonden — draai `npm run prisma:seed` om demo-data te laden."
      />
      <EmptyState
        icon={Sparkles}
        title="Geen portefeuille"
        description="Zodra er holdings zijn, scant de radar automatisch op kansen."
      />
    </>
  );
}
