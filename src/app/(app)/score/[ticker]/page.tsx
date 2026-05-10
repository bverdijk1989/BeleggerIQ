import { ShieldAlert, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { PaywallCard } from "@/components/entitlements/paywall-card";
import { ExplanationPanel } from "@/components/explainability/explanation-panel";
import { ConfidenceScorecard } from "@/components/signal-fusion/confidence-scorecard";
import { Badge } from "@/components/ui/badge";
import { explainConfidence } from "@/lib/ai/explainability";
import { buildPortfolioView } from "@/lib/analytics";
import { loadConfidenceScore } from "@/lib/analytics/signal-fusion";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import {
  canUseFeature,
  getFeature,
  resolveCurrentTier,
} from "@/lib/entitlements";

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

  // Entitlement-check (M29): Confidence Score is een ELITE-feature.
  const tierResult = await resolveCurrentTier(auth.user.email);
  const fusionEntitlement = canUseFeature(
    tierResult.tier,
    "signal_fusion.confidence_score",
    { overrideActive: tierResult.overrideActive },
  );
  const explainEntitlement = canUseFeature(
    tierResult.tier,
    "ai.explainability",
    { overrideActive: tierResult.overrideActive },
  );

  if (!fusionEntitlement.allowed) {
    const feature = getFeature("signal_fusion.confidence_score")!;
    return (
      <>
        <PageHeader
          eyebrow={decoded}
          title={`Confidence · ${decoded}`}
          description="Per instrument een 0–100 score over 10 transparante signaalbronnen."
        />
        <Section
          title="Beschikbaar in Elite"
          description="De Investment Confidence Score combineert kwaliteit, waardering, momentum, macro-fit en portfolio-fit tot één getal."
        >
          <PaywallCard
            featureLabel={feature.label}
            description={feature.description}
            entitlement={fusionEntitlement}
            bonusCopy="Niet alleen de score: je krijgt ook de volledige breakdown per signaal — ROIC, P/E, momentum, regime-impact — met source-tracing."
          />
        </Section>
      </>
    );
  }

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

  const explanation = explainEntitlement.allowed
    ? await explainConfidence(result)
    : null;

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
        title="Uitleg"
        description="Wat betekent deze score in spreektaal — en wat zijn mogelijke acties?"
      >
        {explanation ? (
          <ExplanationPanel explanation={explanation} />
        ) : (
          <PaywallCard
            featureLabel={getFeature("ai.explainability")!.label}
            description={getFeature("ai.explainability")!.description}
            entitlement={explainEntitlement}
            bonusCopy="Krijg een gestructureerde uitleg met conclusie, positieven, risico's en mogelijke acties — met hallucination-guardrails."
          />
        )}
      </Section>

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
