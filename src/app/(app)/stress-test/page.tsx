import { AlertTriangle, FlaskConical, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { CustomScenarioRunner } from "@/components/stress-tests/custom-scenario-runner";
import { ImpactChart } from "@/components/stress-tests/impact-chart";
import { ScenarioCard } from "@/components/stress-tests/scenario-card";
import { Badge } from "@/components/ui/badge";
import { explainScenarios } from "@/lib/ai/explainability";
import { ExplanationPanel } from "@/components/explainability/explanation-panel";
import { loadStressTestReport } from "@/lib/analytics/stress-tests";
import { resolveUserFromServer } from "@/lib/auth";
import {
  canUseFeature,
  getFeature,
  resolveCurrentTier,
} from "@/lib/entitlements";
import { PaywallCard } from "@/components/entitlements/paywall-card";

export const metadata = {
  title: "Stress-tests",
};

export const dynamic = "force-dynamic";

/**
 * /stress-test — 9 vooraf-gedefinieerde stress-scenarios + custom builder.
 *
 * Volledig ELITE-feature (entitlement: scenario.analysis).
 */

export default async function StressTestPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Risico"
          title="Stress-tests"
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

  // Entitlement-check (M9): Scenario-analyse is ELITE+.
  const tierResult = await resolveCurrentTier(auth.user.email);
  const entitlement = canUseFeature(
    tierResult.tier,
    "scenario.analysis",
    { overrideActive: tierResult.overrideActive },
  );
  if (!entitlement.allowed) {
    const feature = getFeature("scenario.analysis")!;
    return (
      <>
        <PageHeader
          eyebrow="Risico"
          title="Stress-tests"
          description="9 vooraf-gedefinieerde scenarios + eigen scenario tegen je portefeuille — Dalio-laag in actie."
        />
        <Section
          title="Beschikbaar in Elite"
          description="Scenario-analyse helpt om je portefeuille te stress-testen tegen recessie, inflatie, sectorshocks en je eigen worst-case."
        >
          <PaywallCard
            featureLabel={feature.label}
            description={feature.description}
            entitlement={entitlement}
            bonusCopy="Je krijgt 9 vooraf-gedefinieerde scenarios + een builder voor je eigen worst-case, met per-positie impact en assumptions-disclosure."
          />
        </Section>
      </>
    );
  }

  const { report, noPortfolio } = await loadStressTestReport({
    userEmail: auth.user.email,
  });

  if (noPortfolio || !report) {
    return (
      <>
        <PageHeader
          eyebrow="Risico"
          title="Stress-tests"
          description="9 vooraf-gedefinieerde scenarios + eigen scenario tegen je portefeuille."
        />
        <EmptyState
          icon={FlaskConical}
          title="Geen portefeuille"
          description="Maak eerst een portefeuille aan om scenarios tegen aan te draaien."
        />
      </>
    );
  }

  // AI-uitleg via Module 7 (Explainability layer).
  const explanation = await explainScenarios({
    baseCurrency: report.baseCurrency,
    scenarios: report.results.map((r) => ({
      name: r.label,
      description: r.description,
      portfolioImpactPct: r.portfolioImpactPct,
      severity: r.severity === "extreme" ? "high" : r.severity === "severe" ? "high" : "moderate",
    })),
  });

  return (
    <>
      <PageHeader
        eyebrow="Risico"
        title="Stress-tests"
        description="9 vooraf-gedefinieerde scenarios + jouw eigen scenario. Dalio-laag: maak risico's expliciet zonder ze weg te moffelen."
        actions={
          <Badge variant="outline" className="text-[10px]">
            {report.results.length} scenarios
          </Badge>
        }
      />

      {/* Disclaimer */}
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-xs text-amber-200">
        <p className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{report.disclaimer}</span>
        </p>
      </div>

      {/* Worst + best */}
      {report.worst && report.best && (
        <Section
          title="Bandbreedte"
          description="Worst-case en best-case op portfolio-impact. Gebruik dit als referentie voor je risicotolerantie."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <article className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-destructive">
                Worst-case
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {report.worst.label}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-destructive">
                {(report.worst.portfolioImpactPct * 100).toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {report.worst.verdict}
              </p>
            </article>
            <article className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                Best-case
              </p>
              <p className="mt-1 text-base font-semibold text-foreground">
                {report.best.label}
              </p>
              <p className="mt-2 font-mono text-2xl font-bold text-emerald-300">
                {report.best.portfolioImpactPct >= 0 ? "+" : ""}
                {(report.best.portfolioImpactPct * 100).toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {report.best.verdict}
              </p>
            </article>
          </div>
        </Section>
      )}

      {/* Visual chart */}
      <Section
        title="Impact per scenario"
        description="Horizontale staaf-vergelijking van portfolio-impact per scenario."
      >
        <div className="rounded-lg border border-border/60 bg-surface/40 p-4">
          <ImpactChart results={report.results} />
        </div>
      </Section>

      {/* AI explanation */}
      <Section
        title="AI-uitleg"
        description="Wat betekenen deze scenarios voor jouw portefeuille — in spreektaal."
      >
        <ExplanationPanel explanation={explanation} />
      </Section>

      {/* Per-scenario kaarten */}
      <Section
        title="Scenarios"
        description="Klik open per scenario voor de aannames en details."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {report.results.map((r) => (
            <ScenarioCard
              key={r.scenario}
              result={r}
              baseCurrency={report.baseCurrency}
            />
          ))}
        </div>
      </Section>

      {/* Custom scenario */}
      <Section
        title="Eigen scenario"
        description="Bouw je eigen worst-case en run 'em tegen je portefeuille. Wood-laag: test innovatieve ideeën zonder DB-persistence."
      >
        <CustomScenarioRunner baseCurrency={report.baseCurrency} />
      </Section>
    </>
  );
}
