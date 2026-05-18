import {
  AlertTriangle,
  ArrowRight,
  HeartPulse,
  Lightbulb,
  ShieldAlert,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildPortfolioView } from "@/lib/analytics";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Welkom bij BeleggerIQ",
};

export const dynamic = "force-dynamic";

/**
 * /welcome — First Value Dashboard (Module 20).
 *
 * Doel: een nieuwe gebruiker ziet binnen 30 seconden:
 *  1. zijn Health Score
 *  2. zijn grootste portefeuille-risico
 *  3. de eerste maandactie
 *  4. "wat betekent dit?"-uitleg
 *  5. een duidelijke next step (CTA)
 *
 * Bewust **minimal** — geen 8-sectie dashboard. We willen retentie in
 * de eerste sessie, geen overweldiging.
 */
export default async function WelcomePage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Welkom"
          title="Welkom bij BeleggerIQ"
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

  // Empty-state als de gebruiker nog geen portfolio heeft.
  if (!portfolio || portfolio.holdings.length === 0) {
    return (
      <>
        <PageHeader
          eyebrow="Welkom"
          title="Eerste portefeuille toevoegen"
          description="Nog 1 stap: voeg minimaal 1 positie toe, dan zie je hier je Health Score en eerste maandactie."
        />
        <Section
          title="Wat ga ik zien?"
          description="Zodra je posities zijn toegevoegd, krijg je 3 dingen tegelijk:"
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <PreviewCard
              icon={HeartPulse}
              label="Portfolio Health Score"
              body="Eén getal 0-100 dat aangeeft hoe gezond je portefeuille is. Inclusief uitleg per component."
            />
            <PreviewCard
              icon={AlertTriangle}
              label="Grootste risico"
              body="Bijvoorbeeld concentratie, te weinig cash of overweging in één sector."
            />
            <PreviewCard
              icon={Target}
              label="Eerste maandactie"
              body="Wat zou je deze maand kunnen doen — concreet en hedged (geen advies)."
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button asChild className="w-full sm:w-auto">
              <Link href={"/portfolio" as never}>
                Voeg eerste positie toe
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href={"/transacties" as never}>
                Of importeer een DEGIRO CSV
              </Link>
            </Button>
          </div>
        </Section>
      </>
    );
  }

  // Portfolio aanwezig — bouw view (basis health-score zit in view.health).
  const view = await buildPortfolioView(portfolio, {
    includeFundamentals: true,
    includeFactorScores: true,
  });
  const health = view.health;

  // Grootste risico = top-1 risk-flag.
  const topRisk =
    view.risk.flags
      .slice()
      .sort(
        (a, b) =>
          severityWeight(b.severity) - severityWeight(a.severity),
      )[0] ?? null;

  // Eerste maandactie = top rebalance-recommendation (`reasons[0]` als detail).
  const topRebalance = view.rebalance.recommendations[0] ?? null;
  const actionLabel: Record<string, string> = {
    NO_ACTION: "Houd vast",
    TRIM_LIGHT: "Lichte trim",
    TRIM_HEAVY: "Trim zwaarder",
    RECONSIDER: "Heroverweeg",
  };
  const firstAction = topRebalance
    ? {
        title: `${actionLabel[topRebalance.action] ?? topRebalance.action}: ${topRebalance.ticker}`,
        detail:
          topRebalance.reasons[0] ??
          "Bekijk maandbeslissing voor volledige uitleg.",
      }
    : null;

  return (
    <>
      <PageHeader
        eyebrow="Welkom"
        title={`Health Score ${Math.round(health.score)}/100 · ${health.grade}`}
        description={`Eerste indruk van je portefeuille. Grade ${health.grade} — ${gradeMeaning(health.grade)}.`}
        actions={
          <Badge variant="outline" className="text-[10px]">
            First-Value
          </Badge>
        }
      />

      <Section
        title="Wat betekent dit?"
        description="Drie inzichten — direct bruikbaar."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {/* 1. Health */}
          <ValueCard
            icon={HeartPulse}
            tone="success"
            label="Portfolio Health"
            value={`${Math.round(health.score)}/100`}
            description={`Grade ${health.grade} — ${health.signals.length} signalen actief`}
          />

          {/* 2. Grootste risico */}
          <ValueCard
            icon={AlertTriangle}
            tone="warning"
            label="Grootste risico"
            value={topRisk?.label ?? "Geen direct risico"}
            description={
              topRisk?.message ??
              "Risk-engine vond geen flag met hoge urgentie. Houd 't in de gaten."
            }
          />

          {/* 3. Eerste maandactie */}
          <ValueCard
            icon={Target}
            tone="neutral"
            label="Eerste maandactie"
            value={firstAction?.title ?? "Plan een review"}
            description={
              firstAction?.detail ??
              "Bekijk je portefeuille en doelen — een halfjaarlijkse review helpt drift te voorkomen."
            }
          />
        </div>
      </Section>

      <Section
        title="Wat betekent deze score?"
        description="In gewone taal — geen jargon."
      >
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-100">
          <p className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <span>
              Je Health Score combineert spreiding, sectoren,
              volatiliteit, kwaliteit, waardering en macro-fit. De grade{" "}
              <strong>{health.grade}</strong> betekent{" "}
              {gradeMeaning(health.grade)}. Hieronder zie je de
              top-aandachtspunten — geen koop-/verkoopadvies, alleen
              meetbare aandacht.
            </span>
          </p>
        </div>
      </Section>

      <Section
        title="Volgende stap"
        description="Twee paden — kies wat past."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="space-y-2 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Bekijk je volledige dashboard
              </p>
              <p className="text-xs text-muted-foreground">
                Alle modules: portfolio-health detail, behavioral coach,
                macroregime, watchlist intelligence.
              </p>
              <Button asChild size="sm" className="w-full sm:w-auto">
                <Link href={"/dashboard" as never}>
                  Naar dashboard
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-semibold text-foreground">
                Stel een doel in
              </p>
              <p className="text-xs text-muted-foreground">
                Pensioen, FIRE, dividend-inkomen — koppel een concreet
                doel zodat je voortgang per maand ziet.
              </p>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                <Link href={"/doelen/nieuw" as never}>
                  Eerste doel instellen
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      <UpgradeHint />
    </>
  );
}

function gradeMeaning(grade: string): string {
  switch (grade) {
    case "A":
      return "uitstekend — sterke spreiding en risico-beheersing";
    case "B":
      return "goed — paar aandachtspunten maar fundament staat";
    case "C":
      return "redelijk — meerdere verbeterpunten zichtbaar";
    case "D":
      return "voorzichtig — concentratie of risico is verhoogd";
    case "F":
      return "kritiek — directe review aanbevolen";
    default:
      return "afhankelijk van data-kwaliteit en context";
  }
}

function severityWeight(s: string): number {
  switch (s) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "elevated":
      return 3;
    case "moderate":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function PreviewCard({
  icon: Icon,
  label,
  body,
}: {
  icon: typeof HeartPulse;
  label: string;
  body: string;
}) {
  return (
    <Card className="border-border/60 bg-surface/40">
      <CardContent className="space-y-2 p-4">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

type ToneKey = "success" | "warning" | "neutral";

function ValueCard({
  icon: Icon,
  tone,
  label,
  value,
  description,
}: {
  icon: typeof HeartPulse;
  tone: ToneKey;
  label: string;
  value: string;
  description: string;
}) {
  const toneClass = {
    success: "border-emerald-500/40 bg-emerald-500/5",
    warning: "border-amber-500/40 bg-amber-500/5",
    neutral: "border-border/60 bg-surface/40",
  }[tone];

  return (
    <Card className={cn("border", toneClass)}>
      <CardContent className="space-y-1.5 p-4">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </p>
        <p className="font-mono text-base font-bold text-foreground">
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function UpgradeHint() {
  // Subtiel — geen pop-up, geen dark pattern. Eén regel met link.
  return (
    <Section
      title=""
      description=""
    >
      <div className="rounded-md border border-border/40 bg-muted/10 p-3 text-xs text-muted-foreground">
        <p>
          Wil je per ticker een Confidence-score (kwaliteit + waardering +
          momentum + macro) + AI-uitleg overal? Bekijk{" "}
          <Link
            href={"/pricing" as never}
            className="text-primary hover:underline"
          >
            Pro & Elite plans
          </Link>
          .
        </p>
      </div>
    </Section>
  );
}
