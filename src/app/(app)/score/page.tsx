import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, ShieldAlert, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { buildPortfolioView } from "@/lib/analytics";
import { loadConfidenceScore } from "@/lib/analytics/signal-fusion";
import type { ConfidenceTier } from "@/lib/analytics/signal-fusion/types";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Investment Confidence",
};

export const dynamic = "force-dynamic";

/**
 * /score — overzicht van alle holdings met hun Investment Confidence Score.
 *
 * Klik door op een ticker voor de volledige 10-signaal breakdown.
 */

const TIER_TONE: Record<ConfidenceTier, string> = {
  STRONG: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  POSITIVE: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  NEUTRAL: "border-border/40 bg-muted/20",
  WEAK: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  AVOID: "border-destructive/40 bg-destructive/10 text-destructive",
};

const TIER_LABEL: Record<ConfidenceTier, string> = {
  STRONG: "Sterk",
  POSITIVE: "Positief",
  NEUTRAL: "Neutraal",
  WEAK: "Zwak",
  AVOID: "Onzeker",
};

export default async function ConfidencePage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Score"
          title="Investment Confidence"
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
    return (
      <>
        <PageHeader
          eyebrow="Score"
          title="Investment Confidence"
          description="0..100 score per instrument over 10 transparante signaalbronnen."
        />
        <EmptyState
          icon={Sparkles}
          title="Geen portefeuille"
          description="Voeg posities toe om per instrument een Confidence Score te zien."
        />
      </>
    );
  }

  const view = await buildPortfolioView(portfolio, {
    includeFundamentals: true,
    includeFactorScores: true,
  });

  if (view.valuations.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Score"
          title="Investment Confidence"
          description="Geen posities gevonden."
        />
        <EmptyState
          icon={Sparkles}
          title="Lege portefeuille"
          description="Voeg holdings toe om de Signal Fusion Engine te draaien."
        />
      </>
    );
  }

  // Score elke positie. Parallel om wachttijd te beperken.
  const scored = await Promise.all(
    view.valuations.map((v) =>
      loadConfidenceScore({ ticker: v.holding.ticker, view }).then((score) => ({
        valuation: v,
        score,
      })),
    ),
  );
  // Sorteer op score desc.
  scored.sort((a, b) => b.score.totalScore - a.score.totalScore);

  return (
    <>
      <PageHeader
        eyebrow="Score"
        title="Investment Confidence"
        description="Per positie een 0..100 score over 10 transparante signaalbronnen. Klik door voor de volledige breakdown."
        actions={
          <Badge variant="outline" className="text-[10px]">
            {scored.length} posities gescoord
          </Badge>
        }
      />

      <Section
        title="Posities"
        description="Gerangschikt op totaalscore. Lage data-dekking kleurt amber — interpreteer met onzekerheidsmarge."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {scored.map(({ valuation, score }) => {
            const detailHref: Route =
              `/score/${encodeURIComponent(valuation.holding.ticker)}` as Route;
            return (
              <Link
                key={valuation.holding.id}
                href={detailHref}
                className={cn(
                  "block rounded-md border p-4 transition-colors hover:border-primary/40",
                  TIER_TONE[score.tier],
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {valuation.holding.ticker}
                    </p>
                    <h4 className="text-sm font-semibold text-foreground">
                      {valuation.holding.name}
                    </h4>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {score.headline}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-2xl font-bold tabular-nums text-foreground">
                      {score.totalScore}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {TIER_LABEL[score.tier]}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[9px]">
                    Data: {score.dataQuality}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-[10px] text-primary">
                    Volledige breakdown <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </Section>
    </>
  );
}
