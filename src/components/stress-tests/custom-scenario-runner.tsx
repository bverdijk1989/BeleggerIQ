"use client";

import { useState, useTransition } from "react";

import { runCustomStressTestAction } from "@/lib/analytics/stress-tests/actions";
import type { StressTestResult } from "@/lib/analytics/stress-tests";

import {
  CustomScenarioForm,
  type CustomScenarioFormValues,
} from "./custom-scenario-form";
import { ScenarioCard } from "./scenario-card";

/**
 * CustomScenarioRunner — wraps het form + roept de server-action aan
 * en toont het resultaat.
 *
 * Geen DB-persistence — pure ad-hoc tool.
 */

interface Props {
  baseCurrency: string;
}

export function CustomScenarioRunner({ baseCurrency }: Props) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<StressTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onRun(values: CustomScenarioFormValues) {
    setError(null);
    startTransition(async () => {
      const res = await runCustomStressTestAction({
        label: values.label,
        description: values.description,
        assumptions: [
          values.description,
          `Default-shock ${(values.defaultShock * 100).toFixed(0)}%`,
          `Tech ${(values.techShock * 100).toFixed(0)}% / Growth ${(values.growthShock * 100).toFixed(0)}%`,
          `Bonds ${(values.bondShock * 100).toFixed(0)}%, Currency ${(values.currencyShock * 100).toFixed(0)}%, Cash ${(values.cashShock * 100).toFixed(0)}%`,
        ],
        sectorShocks: {
          tech: values.techShock,
          growth: values.growthShock,
          energy: values.energyShock,
          financials: values.financialsShock,
        },
        defaultShock: values.defaultShock,
        currencyShock: values.currencyShock,
        bondShock: values.bondShock,
        cashShock: values.cashShock,
        severity: values.severity,
      });
      if (!res.ok || !res.result) {
        setError(res.error ?? "Onbekende fout");
        setResult(null);
        return;
      }
      setResult(res.result);
    });
  }

  return (
    <div className="space-y-4">
      <CustomScenarioForm onRun={onRun} pending={pending} />

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {result && (
        <ScenarioCard result={result} baseCurrency={baseCurrency} />
      )}
    </div>
  );
}
