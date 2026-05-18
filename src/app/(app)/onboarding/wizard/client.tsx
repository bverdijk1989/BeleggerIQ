"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  INVESTMENT_STYLE_DESCRIPTIONS,
  INVESTMENT_STYLE_LABELS,
  PORTFOLIO_BOOTSTRAP_LABELS,
  WIZARD_STEP_LABELS,
  WIZARD_STEP_ORDER,
  defaultPreferences,
  nextStep,
  previousStep,
  stepIndex,
  wizardProgressPercent,
  type InvestmentStyle,
  type OnboardingPreferences,
  type PortfolioBootstrap,
  type WizardStep,
} from "@/lib/onboarding/wizard";
import { cn } from "@/lib/utils";
import type {
  InvestmentObjective,
  RiskTolerance,
  UxMode,
} from "@/types/profile";

import { saveOnboardingPreferences } from "../actions";

/**
 * Module 20 — 5-stappen client-side wizard. Mobile-first layout
 * (single-column, grote tap-targets, geen tabs).
 *
 * Vertaalt user-keuzes naar UserProfile-velden via de server action
 * `saveOnboardingPreferences`. Eindigt met redirect naar /welcome.
 */
export function OnboardingWizardClient() {
  const router = useRouter();
  const [current, setCurrent] = useState<WizardStep>("OBJECTIVE");
  const [prefs, setPrefs] = useState<OnboardingPreferences>(
    defaultPreferences(),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const progress = wizardProgressPercent(current);
  const isLast = current === "PORTFOLIO";

  function handleNext() {
    setError(null);
    if (isLast) {
      startTransition(async () => {
        const result = await saveOnboardingPreferences(prefs);
        if (!result.ok) {
          setError(result.message ?? "Onbekende fout");
          return;
        }
        router.push("/welcome" as never);
      });
      return;
    }
    const next = nextStep(current);
    if (next) setCurrent(next);
  }

  function handlePrevious() {
    const prev = previousStep(current);
    if (prev) setCurrent(prev);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
      {/* Header + progress — mobile-first stack */}
      <header className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Stap {stepIndex(current)} van {WIZARD_STEP_ORDER.length}
        </p>
        <h1 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">
          {WIZARD_STEP_LABELS[current]}
        </h1>
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
            aria-hidden
          />
        </div>
      </header>

      {/* Step body */}
      <Card className="border-border/60 bg-surface/40">
        <CardContent className="p-4 sm:p-6">
          {current === "OBJECTIVE" && (
            <ObjectiveStep
              value={prefs.objective}
              onChange={(v) => setPrefs({ ...prefs, objective: v })}
            />
          )}
          {current === "EXPERIENCE" && (
            <ExperienceStep
              value={prefs.uxMode}
              onChange={(v) => setPrefs({ ...prefs, uxMode: v })}
            />
          )}
          {current === "RISK" && (
            <RiskStep
              value={prefs.riskTolerance}
              onChange={(v) => setPrefs({ ...prefs, riskTolerance: v })}
            />
          )}
          {current === "STYLE" && (
            <StyleStep
              value={prefs.style}
              onChange={(v) => setPrefs({ ...prefs, style: v })}
            />
          )}
          {current === "PORTFOLIO" && (
            <PortfolioStep
              value={prefs.portfolioBootstrap}
              onChange={(v) =>
                setPrefs({ ...prefs, portfolioBootstrap: v })
              }
            />
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Footer-nav — full-width buttons op mobile */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={current === "OBJECTIVE" || isPending}
          className="w-full sm:w-auto"
        >
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden /> Terug
        </Button>
        <Button
          onClick={handleNext}
          disabled={isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
          ) : isLast ? (
            <CheckCircle2 className="mr-1 h-4 w-4" aria-hidden />
          ) : (
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          )}
          {isLast ? "Voltooi & bekijk dashboard" : "Volgende"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================
//  Steps — pure UI, geen state-machine
// ============================================================

interface OptionCard<T extends string> {
  value: T;
  label: string;
  description: string;
}

function ChoiceList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ReadonlyArray<OptionCard<T>>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "w-full rounded-md border p-3 text-left transition-colors",
            value === opt.value
              ? "border-primary/60 bg-primary/10"
              : "border-border/60 bg-background hover:border-border",
          )}
        >
          <p className="font-medium text-foreground">{opt.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {opt.description}
          </p>
        </button>
      ))}
    </div>
  );
}

function ObjectiveStep({
  value,
  onChange,
}: {
  value: InvestmentObjective;
  onChange: (v: InvestmentObjective) => void;
}) {
  const options = useMemo<ReadonlyArray<OptionCard<InvestmentObjective>>>(
    () => [
      {
        value: "RETIREMENT",
        label: "Pensioen opbouwen",
        description: "Lange horizon, stabiele groei, compound",
      },
      {
        value: "FIRE",
        label: "Financiële onafhankelijkheid (FIRE)",
        description: "Eerder stoppen met werken via vermogensgroei",
      },
      {
        value: "GROWTH",
        label: "Vermogensgroei",
        description: "Focus op kapitaalgroei over lange termijn",
      },
      {
        value: "INCOME",
        label: "Inkomen uit dividend",
        description: "Periodieke uitkeringen als doel",
      },
      {
        value: "BALANCED",
        label: "Mix — groei + stabiliteit",
        description: "Combinatie van groei en risicobeperking",
      },
      {
        value: "CAPITAL_PRESERVATION",
        label: "Vermogen behouden",
        description: "Voorkom verlies belangrijker dan groei",
      },
    ],
    [],
  );
  return (
    <ChoiceList
      options={options}
      value={value}
      onChange={onChange as (v: string) => void as (v: InvestmentObjective) => void}
    />
  );
}

function ExperienceStep({
  value,
  onChange,
}: {
  value: UxMode;
  onChange: (v: UxMode) => void;
}) {
  const options: ReadonlyArray<OptionCard<UxMode>> = [
    {
      value: "BEGINNER",
      label: "Beginner",
      description: "Ik wil eenvoudige uitleg, grote knoppen, weinig grafieken.",
    },
    {
      value: "FOCUS",
      label: "Focus",
      description: "Geef me de hoofdsignalen en laat de details weg.",
    },
    {
      value: "EXPERT",
      label: "Expert",
      description: "Toon factoren, regimes, backtests — alle data zichtbaar.",
    },
  ];
  return <ChoiceList options={options} value={value} onChange={onChange} />;
}

function RiskStep({
  value,
  onChange,
}: {
  value: RiskTolerance;
  onChange: (v: RiskTolerance) => void;
}) {
  const options: ReadonlyArray<OptionCard<RiskTolerance>> = [
    {
      value: "CONSERVATIVE",
      label: "Voorzichtig",
      description: "Liever stabiele rendementen, minimale schommelingen.",
    },
    {
      value: "BALANCED",
      label: "Gebalanceerd",
      description: "Acceptatie van enige schommeling voor betere groei.",
    },
    {
      value: "GROWTH",
      label: "Groei-georiënteerd",
      description: "Ik accepteer flinkere drawdowns voor hogere groei.",
    },
    {
      value: "AGGRESSIVE",
      label: "Agressief",
      description: "Maximale groei, ik kan grote drawdowns aan.",
    },
  ];
  return <ChoiceList options={options} value={value} onChange={onChange} />;
}

function StyleStep({
  value,
  onChange,
}: {
  value: InvestmentStyle;
  onChange: (v: InvestmentStyle) => void;
}) {
  const options: ReadonlyArray<OptionCard<InvestmentStyle>> = (
    ["ETF", "DIVIDEND", "STOCKS", "CRYPTO", "MIXED"] as const
  ).map((k) => ({
    value: k,
    label: INVESTMENT_STYLE_LABELS[k],
    description: INVESTMENT_STYLE_DESCRIPTIONS[k],
  }));
  return <ChoiceList options={options} value={value} onChange={onChange} />;
}

function PortfolioStep({
  value,
  onChange,
}: {
  value: PortfolioBootstrap;
  onChange: (v: PortfolioBootstrap) => void;
}) {
  const options: ReadonlyArray<OptionCard<PortfolioBootstrap>> = [
    {
      value: "MANUAL",
      label: PORTFOLIO_BOOTSTRAP_LABELS.MANUAL,
      description:
        "Snelste pad naar persoonlijke inzichten. Voeg 3-5 posities toe.",
    },
    {
      value: "DEMO",
      label: PORTFOLIO_BOOTSTRAP_LABELS.DEMO,
      description:
        "Probeer eerst met een voorbeeld-portefeuille (read-only). Later overschrijven kan.",
    },
    {
      value: "IMPORT_LATER",
      label: PORTFOLIO_BOOTSTRAP_LABELS.IMPORT_LATER,
      description:
        "Sla over en kom hier later op terug via /portfolio of /transacties.",
    },
  ];
  return (
    <div className="space-y-3">
      <ChoiceList options={options} value={value} onChange={onChange} />
      <p className="text-[11px] text-muted-foreground">
        Je kunt deze keuze altijd later wijzigen.
      </p>
    </div>
  );
}

export function OnboardingWizardHeader() {
  return (
    <CardHeader className="pb-3">
      <CardTitle>Onboarding</CardTitle>
      <CardDescription>
        We stellen 5 korte vragen om BeleggerIQ aan jou aan te passen.
      </CardDescription>
    </CardHeader>
  );
}
