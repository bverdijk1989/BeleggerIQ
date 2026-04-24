import { FlaskConical, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { ScenarioResult } from "@/lib/analytics/scenario";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { Currency } from "@/types/common";

interface ScenarioPanelProps {
  scenarios: ScenarioResult[];
  baseCurrency: Currency;
  currentValue: number;
}

/**
 * Compacte scenario-card. Toont per scenario de projected value, absolute
 * delta en relatieve delta. Kleurgebruik is bewust terughoudend:
 *  - positief: muted success
 *  - negatief: muted warning/destructive
 *  - neutraal: grijs
 */
export function ScenarioPanel({
  scenarios,
  baseCurrency,
  currentValue,
}: ScenarioPanelProps) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
            <FlaskConical className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Scenario-analyse
            </p>
            <p className="text-sm text-foreground">
              Hoe gedraagt je portefeuille zich onder eenvoudige stress-scenario&apos;s.
              Huidige waarde:{" "}
              <span className="font-semibold">
                {formatCurrency(currentValue, baseCurrency)}
              </span>
              .
            </p>
          </div>
        </div>

        {scenarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Scenario&apos;s zijn pas beschikbaar zodra je portefeuille gevuld is.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Scenario</th>
                  <th className="px-3 py-2 text-right font-medium">Portefeuille</th>
                  <th className="px-3 py-2 text-right font-medium">Δ Bedrag</th>
                  <th className="px-3 py-2 text-right font-medium">Δ %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {scenarios.map((scenario) => (
                  <ScenarioRow
                    key={scenario.id}
                    scenario={scenario}
                    baseCurrency={baseCurrency}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Illustratief — geen voorspelling, slechts lineaire herwaardering.
        </p>
      </CardContent>
    </Card>
  );
}

function ScenarioRow({
  scenario,
  baseCurrency,
}: {
  scenario: ScenarioResult;
  baseCurrency: Currency;
}) {
  const tone =
    scenario.delta > 0 ? "success" : scenario.delta < 0 ? "destructive" : "muted";
  const Icon =
    tone === "success"
      ? TrendingUp
      : tone === "destructive"
        ? TrendingDown
        : Minus;
  return (
    <tr className="hover:bg-surface-elevated/40">
      <td className="px-3 py-2">
        <div className="font-medium text-foreground">{scenario.label}</div>
        <div className="text-xs text-muted-foreground">{scenario.description}</div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {formatCurrency(scenario.projectedValue, baseCurrency)}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right tabular-nums",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
      >
        <span className="inline-flex items-center gap-1">
          <Icon className="h-3.5 w-3.5" />
          {formatCurrency(scenario.delta, baseCurrency)}
        </span>
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right tabular-nums",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
        )}
      >
        {formatPercent(scenario.deltaPct)}
      </td>
    </tr>
  );
}
