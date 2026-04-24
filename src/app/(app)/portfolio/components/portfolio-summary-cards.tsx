import { Briefcase, Coins, Globe, Layers } from "lucide-react";

import { MetricCard } from "@/components/common/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { AllocationSlice } from "@/types/allocation";
import type { Currency } from "@/types/common";
import type { PortfolioSummary } from "@/types/summary";

interface PortfolioSummaryCardsProps {
  summary: PortfolioSummary;
}

export function PortfolioSummaryCards({ summary }: PortfolioSummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Totale waarde"
        value={formatCurrency(summary.totalValue, summary.baseCurrency)}
        helper="Inclusief cash"
        icon={Briefcase}
      />
      <MetricCard
        label="Aantal posities"
        value={summary.positionCount.toString()}
        helper={summary.positionCount === 1 ? "1 positie" : "unieke tickers"}
        icon={Layers}
      />
      <MetricCard
        label="Grootste positie"
        value={summary.largestPosition?.name ?? "—"}
        helper={
          summary.largestPosition
            ? `${formatPercent(summary.largestPosition.weight)} van portefeuille`
            : "Geen posities"
        }
        icon={Coins}
      />
      <CurrencyAllocationCard
        baseCurrency={summary.baseCurrency}
        allocation={summary.allocationByCurrency}
      />
    </div>
  );
}

interface CurrencyAllocationCardProps {
  baseCurrency: Currency;
  allocation: AllocationSlice[];
}

/**
 * Compacte kaart met de valuta-verdeling. Toont max vier slices en vouwt
 * de rest samen in "Overig" zodat de kaart dezelfde vorm houdt.
 */
function CurrencyAllocationCard({
  baseCurrency,
  allocation,
}: CurrencyAllocationCardProps) {
  const visible = allocation.slice(0, 4);
  const rest = allocation.slice(4);
  const restWeight = rest.reduce((sum, slice) => sum + slice.weight, 0);

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Valuta verdeling
          </p>
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated/80 text-muted-foreground">
            <Globe className="h-4 w-4" />
          </span>
        </div>
        {allocation.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen data</p>
        ) : (
          <ul className="space-y-2">
            {visible.map((slice) => (
              <CurrencyRow
                key={slice.label}
                slice={slice}
                isBase={slice.label === baseCurrency}
              />
            ))}
            {restWeight > 0 && (
              <CurrencyRow
                slice={{
                  label: `Overig (${rest.length})`,
                  value: rest.reduce((sum, r) => sum + r.value, 0),
                  weight: restWeight,
                }}
                isBase={false}
              />
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CurrencyRow({
  slice,
  isBase,
}: {
  slice: AllocationSlice;
  isBase: boolean;
}) {
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 font-medium text-foreground">
          {slice.label}
          {isBase && (
            <span className="rounded-sm bg-primary/15 px-1 text-[9px] uppercase tracking-wider text-primary">
              base
            </span>
          )}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {formatPercent(slice.weight)}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated/60">
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${Math.min(100, slice.weight * 100)}%` }}
        />
      </div>
    </li>
  );
}
