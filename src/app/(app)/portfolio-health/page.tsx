import { ShieldAlert, Sparkles } from "lucide-react";

import { HealthScoreCard } from "@/components/dashboard/decision-cockpit";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { ExplanationPanel } from "@/components/explainability/explanation-panel";
import { HealthComponentRow } from "@/components/portfolio-health/health-component-row";
import { Badge } from "@/components/ui/badge";
import { explainHealth } from "@/lib/ai/explainability";
import { buildPortfolioView } from "@/lib/analytics";
import { loadPortfolioHealthScore } from "@/lib/analytics/health-score";
import { computeRegimeScore } from "@/lib/analytics/regime/engine";
import { resolveUserFromServer } from "@/lib/auth";
import { fetchRegimeInputs } from "@/lib/data/regime";
import { portfolioRepository, portfolioSnapshotRepository } from "@/lib/data";

export const metadata = {
  title: "Portfolio Health",
};

export const dynamic = "force-dynamic";

/**
 * /portfolio-health — detail-pagina voor de Portfolio Health Score.
 *
 * Toont de volledige 10-component breakdown met per component:
 *  - status-tier + score + visuele balk
 *  - rationale (1-zin uitleg)
 *  - verbeteradviezen (alleen bij weak/critical)
 *
 * Aan de bovenkant herhaalt de compacte HealthScoreCard de totaalscore +
 * top-1 next-step zodat de gebruiker direct overzicht heeft. De volgorde
 * van de breakdown matcht `DEFAULT_HEALTH_WEIGHTS` — voorspelbare layout.
 */

export default async function PortfolioHealthPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Analyse"
          title="Portfolio Health"
          description="Authenticatie vereist."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }

  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(auth.user.email)
    .catch(() => null);

  if (!portfolio) {
    return (
      <>
        <PageHeader
          eyebrow="Analyse"
          title="Portfolio Health"
          description="10-component health score met verbeteradviezen."
        />
        <EmptyState
          icon={Sparkles}
          title="Geen portefeuille"
          description="Maak eerst een portefeuille aan om je health-score te zien."
        />
      </>
    );
  }

  const [view, regimeFetch, snapshots] = await Promise.all([
    buildPortfolioView(portfolio, {
      includeFundamentals: true,
      includeFactorScores: true,
    }),
    fetchRegimeInputs(),
    portfolioSnapshotRepository.listForPortfolio(portfolio.id, 180).catch(() => []),
  ]);

  const regime = regimeFetch
    ? computeRegimeScore(regimeFetch.input, {
        asOf: regimeFetch.asOf,
        source: regimeFetch.source,
      })
    : null;

  const score = loadPortfolioHealthScore({
    view,
    regime,
    snapshots,
    profile: ctx?.profile ?? null,
    policy: ctx?.profile?.policy ?? null,
  });

  const activeComponents = score.components.filter((c) => c.status !== "no_data");
  const noDataComponents = score.components.filter((c) => c.status === "no_data");

  const explanation = await explainHealth(score);

  return (
    <>
      <PageHeader
        eyebrow="Analyse"
        title="Portfolio Health"
        description="10-component health-score met verbeteradviezen per zwakke pijler."
      />

      <Section
        title="Samenvatting"
        description="In één oogopslag: totaalscore, grade, en de eerstvolgende verbetering."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <HealthScoreCard score={score} />

          <div className="rounded-lg border border-border/60 bg-surface/40 p-4">
            <h3 className="text-sm font-semibold text-foreground">Top-3 verbeteringen</h3>
            <p className="text-xs text-muted-foreground">
              Acties met de grootste verwachte impact op je totaalscore.
            </p>
            {score.topRecommendations.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Geen kritieke verbeterpunten — alle componenten staan op orde of hoger.
              </p>
            ) : (
              <ol className="mt-3 space-y-2">
                {score.topRecommendations.map((rec, idx) => (
                  <li
                    key={rec.title}
                    className="rounded-md border border-border/40 bg-background/40 p-3 text-xs"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-medium text-foreground">
                        {idx + 1}. {rec.title}
                      </p>
                      {typeof rec.expectedImpact === "number" &&
                        rec.expectedImpact > 0 && (
                          <Badge variant="outline" className="text-[10px]">
                            +{rec.expectedImpact} pts
                          </Badge>
                        )}
                    </div>
                    <p className="mt-1 text-muted-foreground">{rec.detail}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="Uitleg"
        description="Wat betekent deze score in spreektaal — en wat kan je ermee?"
      >
        <ExplanationPanel explanation={explanation} />
      </Section>

      <Section
        title="Component-breakdown"
        description={`${activeComponents.length} van de 10 componenten dragen bij aan de totaalscore. Gewogen totaal = ${Math.round(
          score.totalScore,
        )}/100.`}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {activeComponents.map((c) => (
            <HealthComponentRow key={c.key} component={c} />
          ))}
        </div>
      </Section>

      {noDataComponents.length > 0 && (
        <Section
          title="Componenten zonder data"
          description="Deze componenten konden niet betrouwbaar worden gemeten en tellen niet mee in de totaalscore. Het gewicht is herverdeeld over de actieve componenten."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {noDataComponents.map((c) => (
              <HealthComponentRow key={c.key} component={c} />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Methodologie"
        description="Hoe de score is opgebouwd."
      >
        <div className="rounded-lg border border-border/60 bg-surface/40 p-4 text-xs text-muted-foreground">
          <p>
            <strong className="text-foreground">Totaalscore</strong> = gewogen
            som over de 10 componenten. Componenten zonder data
            (status &ldquo;Geen data&rdquo;) worden uit de noemer gehaald en hun
            gewicht herverdeeld. Het bruikbare gewicht is{" "}
            {(score.effectiveWeight * 100).toFixed(0)}%.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Confidence</strong>{" "}
            ({Math.round(score.confidence * 100)}%) is het gewogen gemiddelde
            van per-component confidence. Lager dan 50% = wankele basis;
            interpreteer scores dan met een marge van ±5–10 punten.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Validatie</strong>: gewichten
            en drempels gemotiveerd via 5-lens consensus
            (Buffett · Dalio · Lynch · Simons · Wood). Zie{" "}
            <code className="rounded bg-muted/30 px-1">docs/PORTFOLIO_HEALTH_SCORE.md</code>.
          </p>
        </div>
      </Section>
    </>
  );
}
