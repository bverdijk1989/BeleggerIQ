import { CalendarClock, ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { buildPortfolioView, generateAllocationPlan } from "@/lib/analytics";
import { computeRegimeScore } from "@/lib/analytics/regime/engine";
import { resolveUserFromServer } from "@/lib/auth";
import { fetchRegimeInputs } from "@/lib/data/regime";
import { portfolioRepository } from "@/lib/data";
import { buildOrderList } from "@/lib/orders/build-orders";
import { resolveActiveSelection } from "@/lib/portfolios";

import {
  biasBudgetMultiplier,
  DEFAULT_MONTHLY_BUDGET,
  parseMaandbeslissingParams,
  type MaandbeslissingConfig,
} from "./build-plan-input";
import { InputsForm } from "./components/inputs-form";
import { OrderExport } from "./components/order-export";
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

  const selection = await resolveActiveSelection({
    email: auth.user.email,
    searchParams: resolvedParams,
  });

  // Maandbeslissing werkt per-portfolio (1 budget, 1 plan). Voor de
  // "alle"-keuze sturen we de gebruiker terug naar dashboard-aggregate
  // — engines hebben hier geen aggregate-modus en de UX zou ambigu zijn.
  if (selection.kind === "empty" || selection.kind === "all") {
    if (selection.kind === "all") {
      return <SelectSpecificPortfolioState />;
    }
    return <NoPortfolioState />;
  }

  const context = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);

  if (!context) {
    return <NoPortfolioState />;
  }

  const portfolio = selection.portfolio;

  const [view, regimeFetch] = await Promise.all([
    buildPortfolioView(portfolio, {
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
    portfolioId: portfolio.id,
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

  // Build order-list voor de manual-broker export. Pure functie:
  // recommendations + ISIN-lookup uit holdings + quotes uit valuations.
  const isinByTicker = new Map<string, string | null>();
  for (const h of portfolio.holdings) isinByTicker.set(h.ticker, h.isin ?? null);
  const quoteByTicker = new Map<string, { price: number; currency: string }>();
  for (const v of view.valuations) {
    if (v.unitPrice !== null && v.unitPrice !== undefined) {
      quoteByTicker.set(v.holding.ticker, {
        price: v.unitPrice,
        currency: v.holding.currency ?? view.summary.baseCurrency,
      });
    }
  }
  const orderRows = buildOrderList({
    recommendations: plan.recommendations,
    isinByTicker,
    quoteByTicker,
  });
  const exportFileName = `beleggeriq-orders-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

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

      <Section
        title="Manual broker export"
        description="Download dit plan als CSV of plak 'm direct in Excel/Sheets. Geen automatische uitvoering — je voert de orders zelf in bij je broker."
      >
        <OrderExport rows={orderRows} fileName={exportFileName} />
      </Section>
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

function SelectSpecificPortfolioState() {
  return (
    <>
      <PageHeader
        eyebrow="Beslissingen"
        title="Maandbeslissing"
        description="Kies een specifieke portefeuille."
      />
      <EmptyState
        icon={CalendarClock}
        title="Selecteer een portefeuille"
        description="De maandbeslissing werkt per portefeuille — gebruik de switcher rechtsboven om er één te kiezen."
      />
    </>
  );
}
