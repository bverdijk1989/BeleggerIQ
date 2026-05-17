"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  createGoalAction,
  deleteGoalAction,
  updateGoalAction,
} from "@/lib/analytics/goals/actions";
import {
  DEFAULT_EXPECTED_RETURN,
  GOAL_TYPE_DESCRIPTIONS,
  GOAL_TYPE_LABELS,
  type FinancialGoal,
  type GoalType,
} from "@/lib/analytics/goals/types";
import { cn } from "@/lib/utils";
import type { Currency } from "@/types/common";
import type { RiskTolerance } from "@/types/profile";

/**
 * GoalForm — create/edit-formulier voor één doel.
 *
 * Toon: helder, niet betuttelend. We tonen ALLE 8 doel-types met korte
 * beschrijving zodat de gebruiker direct begrijpt wat 'em past.
 *
 * Validatie gebeurt server-side (zie `actions.ts`); de form-laag toont
 * alleen UX-tips (negatieve waarden, datum in toekomst).
 */

interface Props {
  mode: "create" | "edit";
  initial?: FinancialGoal;
  defaultBaseCurrency?: Currency;
  /** Optionele lijst van portefeuilles waar het doel aan gekoppeld kan worden. */
  availablePortfolios?: ReadonlyArray<{ id: string; name: string }>;
}

const GOAL_TYPES: GoalType[] = [
  "RETIREMENT",
  "FIRE",
  "DIVIDEND_INCOME",
  "WEALTH_GROWTH",
  "HOME_PURCHASE",
  "EDUCATION",
  "EMERGENCY_FUND",
  "CUSTOM",
];

const RISK_PROFILES: RiskTolerance[] = [
  "CONSERVATIVE",
  "BALANCED",
  "GROWTH",
  "AGGRESSIVE",
];

const RISK_PROFILE_LABELS: Record<RiskTolerance, string> = {
  CONSERVATIVE: "Conservatief",
  BALANCED: "Gebalanceerd",
  GROWTH: "Groei",
  AGGRESSIVE: "Agressief",
};

export function GoalForm({
  mode,
  initial,
  defaultBaseCurrency = "EUR",
  availablePortfolios = [],
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<GoalType>(initial?.type ?? "WEALTH_GROWTH");
  const [name, setName] = useState(initial?.name ?? GOAL_TYPE_LABELS[type]);
  const [targetAmount, setTargetAmount] = useState(
    initial?.targetAmount?.toString() ?? "100000",
  );
  const [targetDate, setTargetDate] = useState(
    initial?.targetDate?.slice(0, 10) ??
      defaultTargetDate(15).toISOString().slice(0, 10),
  );
  const [monthlyContribution, setMonthlyContribution] = useState(
    initial?.monthlyContribution?.toString() ?? "300",
  );
  const [currentAmount, setCurrentAmount] = useState(
    initial?.currentAmount?.toString() ?? "0",
  );
  const [riskProfile, setRiskProfile] = useState<RiskTolerance>(
    initial?.riskProfile ?? "BALANCED",
  );
  const [expectedAnnualReturn, setExpectedAnnualReturn] = useState(
    initial?.expectedAnnualReturn != null
      ? (initial.expectedAnnualReturn * 100).toString()
      : (DEFAULT_EXPECTED_RETURN[initial?.riskProfile ?? "BALANCED"] * 100).toString(),
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [portfolioId, setPortfolioId] = useState<string>(
    initial?.portfolioId ?? "",
  );

  function onTypeChange(next: GoalType) {
    setType(next);
    if (mode === "create" || !initial?.name) {
      setName(GOAL_TYPE_LABELS[next]);
    }
  }

  function onRiskChange(next: RiskTolerance) {
    setRiskProfile(next);
    // Bij wijziging van risicoprofiel het verwachte rendement automatisch
    // bijstellen — de gebruiker kan 'em handmatig overschrijven.
    setExpectedAnnualReturn((DEFAULT_EXPECTED_RETURN[next] * 100).toString());
  }

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);

    const payload = {
      type,
      name: name.trim(),
      targetAmount: Number(targetAmount),
      targetDate,
      monthlyContribution: Number(monthlyContribution),
      currentAmount: Number(currentAmount),
      expectedAnnualReturn: Number(expectedAnnualReturn) / 100,
      riskProfile,
      baseCurrency: defaultBaseCurrency,
      description: description.trim() || null,
      portfolioId: portfolioId.length > 0 ? portfolioId : null,
    };

    startTransition(async () => {
      if (mode === "create") {
        const result = await createGoalAction(payload);
        if (!result.ok) {
          setError(result.error ?? "Onbekende fout");
          return;
        }
        router.push(`/doelen/${result.goalId}` as Route);
      } else if (initial) {
        const result = await updateGoalAction({
          ...payload,
          goalId: initial.id,
        });
        if (!result.ok) {
          setError(result.error ?? "Onbekende fout");
          return;
        }
        router.refresh();
      }
    });
  }

  function onDelete() {
    if (!initial) return;
    if (!confirm(`Doel "${initial.name}" verwijderen?`)) return;
    startTransition(async () => {
      const result = await deleteGoalAction({ goalId: initial.id });
      if (!result.ok) {
        setError(result.error ?? "Onbekende fout");
        return;
      }
      router.push("/doelen" as Route);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Type */}
        <div className="space-y-1.5">
          <Label>Type doel</Label>
          <select
            value={type}
            onChange={(e) => onTypeChange(e.target.value as GoalType)}
            className={selectClasses}
          >
            {GOAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {GOAL_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {GOAL_TYPE_DESCRIPTIONS[type]}
          </p>
        </div>

        {/* Naam */}
        <Field
          label="Naam"
          value={name}
          onChange={setName}
          required
          maxLength={200}
        />

        {/* Doelbedrag */}
        <Field
          label="Doelbedrag (€)"
          value={targetAmount}
          onChange={setTargetAmount}
          type="number"
          step="100"
          required
        />

        {/* Streefdatum */}
        <Field
          label="Streefdatum"
          value={targetDate}
          onChange={setTargetDate}
          type="date"
          required
        />

        {/* Maandelijkse inleg */}
        <Field
          label="Maandelijkse inleg (€)"
          value={monthlyContribution}
          onChange={setMonthlyContribution}
          type="number"
          step="10"
        />

        {/* Huidige stand */}
        <Field
          label="Huidige stand (€)"
          value={currentAmount}
          onChange={setCurrentAmount}
          type="number"
          step="100"
          hint={
            portfolioId.length > 0
              ? "Bij een gekoppelde portefeuille wordt deze waarde automatisch overschreven met de live portfolio-waarde — dit veld is alleen een fallback."
              : "Wat je nu al hebt opgebouwd richting dit doel."
          }
        />

        {/* Risicoprofiel */}
        <div className="space-y-1.5">
          <Label>Risicoprofiel</Label>
          <select
            value={riskProfile}
            onChange={(e) => onRiskChange(e.target.value as RiskTolerance)}
            className={selectClasses}
          >
            {RISK_PROFILES.map((r) => (
              <option key={r} value={r}>
                {RISK_PROFILE_LABELS[r]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Default-rendement per profiel: 4% / 6% / 7.5% / 9%.
          </p>
        </div>

        {/* Verwacht rendement */}
        <Field
          label="Verwacht rendement (%/jr)"
          value={expectedAnnualReturn}
          onChange={setExpectedAnnualReturn}
          type="number"
          step="0.1"
          hint="Pas aan als je een ander rendement wilt aanhouden dan de default."
        />
      </div>

      {/* Beschrijving */}
      <div className="space-y-1.5">
        <Label>Beschrijving (optioneel)</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={cn(selectClasses, "resize-y")}
          placeholder="Bv. 'Pensioen op 67 in een mix van groei + dividend.'"
        />
      </div>

      {/* Gekoppelde portefeuille — Module 5 */}
      {availablePortfolios.length > 0 && (
        <div className="space-y-1.5">
          <Label>Gekoppelde portefeuille (optioneel)</Label>
          <select
            value={portfolioId}
            onChange={(e) => setPortfolioId(e.target.value)}
            className={selectClasses}
          >
            <option value="">Geen koppeling — doel staat los</option>
            {availablePortfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Door een portefeuille te koppelen kun je later koppelen tussen
            voortgang en holdings. Niet verplicht — een cash-buffer-doel
            staat vaak los.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {mode === "create" ? "Doel aanmaken" : "Wijzigingen opslaan"}
        </Button>
        {mode === "edit" && initial && (
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={onDelete}
          >
            Verwijder doel
          </Button>
        )}
      </div>
    </form>
  );
}

const selectClasses =
  "block w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/60";

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  required?: boolean;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{props.label}</Label>
      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        type={props.type ?? "text"}
        step={props.step}
        required={props.required}
        maxLength={props.maxLength}
        className={selectClasses}
      />
      {props.hint && (
        <p className="text-xs text-muted-foreground">{props.hint}</p>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
      {children}
    </label>
  );
}

function defaultTargetDate(yearsAhead: number): Date {
  const dt = new Date();
  dt.setUTCFullYear(dt.getUTCFullYear() + yearsAhead);
  return dt;
}
