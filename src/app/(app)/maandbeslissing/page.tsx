import { CalendarClock, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { buildPortfolioView, generateAllocationPlan } from "@/lib/analytics";
import { computeRegimeScore } from "@/lib/analytics/regime/engine";
import { resolveUserFromServer } from "@/lib/auth";
import { fetchRegimeInputs } from "@/lib/data/regime";
import { portfolioRepository } from "@/lib/data";

import {
  biasBudgetMultiplier,
  DEFAULT_MONTHLY_BUDGET,
  parseMaandbeslissingParams,
  type MaandbeslissingConfig,
} from "./build-plan-input";
import { InputsForm } from "./components/inputs-form";
import { PlanHero } from "./components/plan-hero";
import { RecommendationsGrid } from "./components/recommendations-grid";
import { SimulationCompare } from "./components/simulation-compare";
import { WarningsBanner } from "./components/warnings-banner";

export const metadata = {
  title: "Maandbeslissing",
};

export const dynamic = "force-dynamic";

interface MaandbeslissingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MaandbeslissingPage({
  searchParams,
}: MaandbeslissingPageProps) {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Periode"
          title="Maandbeslissing"
          description="Authenticatie vereist."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }

  const resolvedParams = await searchParams;
  const config = parseMaandbeslissingParams(resolvedParams);

  const context = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);

  if (!context || !context.portfolio) {
    return <NoPortfolioState />;
  }

  const [view, regimeFetch] = await Promise.all([
    buildPortfolioView(context.portfolio, {
      includeFundamentals: true,
      includeFactorScores: true,
    }),
    fetchRegimeInputs(),
  ]);

  const regime = regimeFetch
    ? computeRegimeScore(regimeFetch.input, {
        asOf: regimeFetch.asOf,
        source: regimeFetch.source,
      })
    : null;

  const profileContribution =
    context.monthlyContribution !== null
      ? context.monthlyContribution
      : DEFAULT_MONTHLY_BUDGET;
  const baseBudget = config.budget ?? profileContribution;
  const effectiveBudget = Math.max(
    0,
    Math.round(baseBudget * biasBudgetMultiplier(config.bias)),
  );

  const plan = generateAllocationPlan({
    portfolioId: context.portfolio.id,
    baseCurrency: view.summary.baseCurrency,
    valuations: view.valuations,
    totalValue: view.summary.totalValue,
    cashBalance: view.summary.cashBalance,
    monthlyContribution: effectiveBudget,
    policy: context.profile?.policy ?? null,
    objective: context.profile?.objective ?? "BALANCED",
    regime,
    coreEtf: config.coreEtfEnabled ? undefined : null,
  });

  const subtitle = buildSubtitle(config, profileContribution);

  return (
    <>
      <PageHeader
        eyebrow="Beslissingen"
        title="Maandbeslissing"
        description={subtitle}
      />

      <PlanHero plan={plan} regime={regime} />

      <InputsForm
        initial={config}
        defaultBudget={profileContribution}
        baseCurrency={view.summary.baseCurrency}
      />

      <WarningsBanner plan={plan} />

      {plan.recommendations.length > 0 && (
        <Section
          title="Deze maand kopen"
          description={`${plan.recommendations.length} positie${plan.recommendations.length === 1 ? "" : "s"} op volgorde van priority.`}
        >
          <RecommendationsGrid
            recommendations={plan.recommendations}
            baseCurrency={view.summary.baseCurrency}
            coreEtfUsed={plan.coreEtfUsed}
          />
        </Section>
      )}

      {plan.simulation && (
        <Section
          title="Effect op portefeuille"
          description="Simulatie van de post-buy allocatie, concentratie en valuta."
        >
          <SimulationCompare
            summary={view.summary}
            simulation={plan.simulation}
          />
        </Section>
      )}
    </>
  );
}

function buildSubtitle(
  config: MaandbeslissingConfig,
  profileContribution: number,
): string {
  const biasLabel =
    config.bias === "offensive"
      ? "offensieve"
      : config.bias === "defensive"
        ? "defensieve"
        : "gebalanceerde";
  const budgetLabel = config.budget ?? profileContribution;
  return `Concreet koopplan op basis van ${budgetLabel} EUR budget, ${biasLabel} voorkeur, factor-scores en het huidige marktregime.`;
}

function NoPortfolioState() {
  return (
    <>
      <PageHeader
        eyebrow="Beslissingen"
        title="Maandbeslissing"
        description="Geen portefeuille gevonden — draai `npm run prisma:seed` of importeer eerst je holdings."
      />
      <EmptyState
        icon={CalendarClock}
        title="Geen portefeuille"
        description="Zodra je een portefeuille hebt aangemaakt, genereert de engine je maandbeslissing automatisch."
      />
    </>
  );
}
