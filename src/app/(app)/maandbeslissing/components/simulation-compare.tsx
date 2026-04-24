import { ArrowRight, FlaskConical, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { PostBuySimulation } from "@/types/allocation";
import type { Currency } from "@/types/common";
import type { PortfolioSummary } from "@/types/summary";

interface SimulationCompareProps {
  summary: PortfolioSummary;
  simulation: PostBuySimulation;
}

/**
 * Side-by-side before/after tabel. Bewust geen charts — gewoon cijfers met
 * delta's zodat de gebruiker razendsnel ziet wat het plan verandert.
 */
export function SimulationCompare({
  summary,
  simulation,
}: SimulationCompareProps) {
  const rows = buildRows(summary, simulation);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
            <FlaskConical className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Simulatie
            </p>
            <p className="text-sm text-foreground">
              Wat verandert er als je dit plan precies uitvoert.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-border/60">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Metric</th>
                <th className="px-3 py-2 text-right font-medium">Nu</th>
                <th className="px-3 py-2 text-center font-medium"></th>
                <th className="px-3 py-2 text-right font-medium">Na plan</th>
                <th className="px-3 py-2 text-right font-medium">Verschil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((row) => (
                <CompareRow key={row.label} row={row} />
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Lineaire herwaardering · posities krijgen de extra inleg zonder prijseffect.
        </p>
      </CardContent>
    </Card>
  );
}

interface CompareRow {
  label: string;
  currentDisplay: string;
  projectedDisplay: string;
  delta: number | null;
  deltaDisplay: string;
  /** Hoger is beter (groen), lager is slechter (rood). `null` = neutraal. */
  higherIsBetter: boolean | null;
}

function CompareRow({ row }: { row: CompareRow }) {
  const tone =
    row.delta === null || row.higherIsBetter === null || row.delta === 0
      ? "muted"
      : (row.delta > 0) === row.higherIsBetter
        ? "success"
        : "destructive";

  const Icon =
    row.delta === null || row.delta === 0
      ? Minus
      : row.delta > 0
        ? TrendingUp
        : TrendingDown;

  return (
    <tr className="hover:bg-surface-elevated/40">
      <td className="px-3 py-2 font-medium text-foreground">{row.label}</td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {row.currentDisplay}
      </td>
      <td className="px-3 py-2 text-center text-muted-foreground">
        <ArrowRight className="inline h-3.5 w-3.5" />
      </td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
        {row.projectedDisplay}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right tabular-nums",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        <span className="inline-flex items-center gap-1">
          <Icon className="h-3.5 w-3.5" />
          {row.deltaDisplay}
        </span>
      </td>
    </tr>
  );
}

function buildRows(
  summary: PortfolioSummary,
  sim: PostBuySimulation,
): CompareRow[] {
  const baseCurrency = summary.baseCurrency;
  const rows: CompareRow[] = [];

  // Totale waarde — hoger is beter (meer belegd vermogen).
  rows.push(
    currencyRow({
      label: "Totale waarde",
      current: summary.totalValue,
      projected: sim.projectedTotalValue,
      baseCurrency,
      higherIsBetter: true,
    }),
  );

  // Cash — lager is beter (méér deployed), maar niet kritiek.
  rows.push(
    currencyRow({
      label: "Cash",
      current: summary.cashBalance,
      projected: sim.projectedCashBalance,
      baseCurrency,
      higherIsBetter: false,
    }),
  );

  // Aantal posities — hoger = betere spreiding.
  rows.push({
    label: "Aantal posities",
    currentDisplay: String(summary.positionCount),
    projectedDisplay: String(sim.projectedPositionCount),
    delta: sim.projectedPositionCount - summary.positionCount,
    deltaDisplay: formatInt(sim.projectedPositionCount - summary.positionCount),
    higherIsBetter: true,
  });

  // Grootste positie — lager = betere spreiding.
  const currentLargest = summary.largestPosition?.weight ?? 0;
  rows.push(
    percentRow({
      label: "Grootste positie",
      current: currentLargest,
      projected: sim.projectedLargestPositionWeight,
      higherIsBetter: false,
    }),
  );

  // Foreign currency exposure — neutraal. Toont richting zonder oordeel.
  const currentForeign = summary.allocationByCurrency
    .filter((slice) => slice.label !== summary.baseCurrency)
    .reduce((sum, slice) => sum + slice.weight, 0);
  rows.push(
    percentRow({
      label: `Vreemde valuta`,
      current: currentForeign,
      projected: sim.projectedForeignCurrencyExposure,
      higherIsBetter: null,
    }),
  );

  // Top sector — alleen als we beide kennen.
  const currentTopSector =
    summary.allocationBySector.length > 0
      ? summary.allocationBySector[0]!
      : null;
  if (sim.projectedTopSector && currentTopSector) {
    rows.push(
      percentRow({
        label: `Grootste sector (${sim.projectedTopSector.label})`,
        current:
          currentTopSector.label === sim.projectedTopSector.label
            ? currentTopSector.weight
            : sectorWeight(summary, sim.projectedTopSector.label),
        projected: sim.projectedTopSector.weight,
        higherIsBetter: false,
      }),
    );
  }

  return rows;
}

function currencyRow({
  label,
  current,
  projected,
  baseCurrency,
  higherIsBetter,
}: {
  label: string;
  current: number;
  projected: number;
  baseCurrency: Currency;
  higherIsBetter: boolean | null;
}): CompareRow {
  const delta = projected - current;
  return {
    label,
    currentDisplay: formatCurrency(current, baseCurrency),
    projectedDisplay: formatCurrency(projected, baseCurrency),
    delta,
    deltaDisplay: formatCurrency(delta, baseCurrency),
    higherIsBetter,
  };
}

function percentRow({
  label,
  current,
  projected,
  higherIsBetter,
}: {
  label: string;
  current: number;
  projected: number;
  higherIsBetter: boolean | null;
}): CompareRow {
  const delta = projected - current;
  return {
    label,
    currentDisplay: formatPercent(current),
    projectedDisplay: formatPercent(projected),
    delta,
    deltaDisplay: `${delta >= 0 ? "+" : ""}${formatPercent(delta)}`,
    higherIsBetter,
  };
}

function sectorWeight(summary: PortfolioSummary, label: string): number {
  return (
    summary.allocationBySector.find((slice) => slice.label === label)?.weight ??
    0
  );
}

function formatInt(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}
