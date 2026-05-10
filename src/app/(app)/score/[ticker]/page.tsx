import { ShieldAlert, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { ConfidenceScorecard } from "@/components/signal-fusion/confidence-scorecard";
import { Badge } from "@/components/ui/badge";
import { buildPortfolioView } from "@/lib/analytics";
import { loadConfidenceScore } from "@/lib/analytics/signal-fusion";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";

interface Props {
  params: Promise<{ ticker: string }>;
}

export const dynamic = "force-dynamic";

export default async function ConfidenceDetailPage({ params }: Props) {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Score"
          title="Confidence detail"
          description="Authenticatie vereist."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }

  const { ticker } = await params;
  const decoded = decodeURIComponent(ticker).toUpperCase();

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(auth.user.email)
    .catch(() => null);

  const view = portfolio
    ? await buildPortfolioView(portfolio, {
        includeFundamentals: true,
        includeFactorScores: true,
      })
    : null;

  const result = await loadConfidenceScore({ ticker: decoded, view });
  const valuation = view?.valuations.find(
    (v) => v.holding.ticker.toUpperCase() === decoded,
  );

  return (
    <>
      <PageHeader
        eyebrow={decoded}
        title={`Confidence · ${valuation?.holding.name ?? decoded}`}
        description={result.headline}
        actions={
          <Badge variant="outline" className="font-mono">
            {result.totalScore}/100 · {result.tier}
          </Badge>
        }
      />

      <Section
        title="Volledige breakdown"
        description="Tien signalen, ieder met score, gewicht, bijdrage en rationale. Lage data-dekking kleurt amber."
      >
        <ConfidenceScorecard result={result} />
      </Section>

      <Section
        title="Methodologie"
        description="Hoe deze score tot stand komt."
      >
        <div className="rounded-lg border border-border/60 bg-surface/40 p-4 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Renormalisatie</strong>:
            wanneer een signaal geen data heeft, valt zijn gewicht uit de
            noemer. Effectief gewicht in deze score:{" "}
            {Math.round(result.effectiveWeight * 100)}%.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Topbelegger-balans</strong>:
            quality + waardering wegen samen 35% (Buffett-laag),
            macro_sensitivity + portfolio_fit samen 25% (Dalio-laag), en
            elke signal heeft een NL-rationale (Lynch-laag).
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Geen advies</strong>: dit is
            een meting, geen koop-/verkoopadvies. Combineer met je eigen
            thesis en horizon. Zie{" "}
            <code className="rounded bg-muted/30 px-1">
              docs/SIGNAL_FUSION_ENGINE.md
            </code>{" "}
            voor formules en drempels.
          </p>
        </div>
      </Section>

      {!valuation && (
        <EmptyState
          icon={Sparkles}
          title="Niet in je portefeuille"
          description={`${decoded} zit niet in je primary portfolio. Score kon worden berekend op basis van publieke fundamentals en het macro-regime.`}
        />
      )}
    </>
  );
}
