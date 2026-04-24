import { Coins, Globe } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type { AllocationSlice } from "@/types/allocation";
import type { Currency } from "@/types/common";
import type { PositionBreakdown } from "@/types/summary";

/**
 * Twee gedeelde allocation cards voor het dashboard.
 * - HoldingsAllocationCard: top N posities met gewichts-bars.
 * - CurrencyAllocationCard: allocatie per valuta met base-highlight.
 */

export function HoldingsAllocationCard({
  positions,
  baseCurrency,
  limit = 6,
}: {
  positions: PositionBreakdown[];
  baseCurrency: Currency;
  limit?: number;
}) {
  const visible = positions.slice(0, limit);
  const rest = positions.slice(limit);
  const restWeight = rest.reduce((sum, p) => sum + p.weight, 0);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Header
          icon={Coins}
          title="Top posities"
          description="Marktwaarde en aandeel in de portefeuille."
        />
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen posities. Importeer je portefeuille om hier iets te zien.
          </p>
        ) : (
          <ul className="space-y-3">
            {visible.map((p) => (
              <li key={p.ticker} className="space-y-1">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {p.name}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {p.ticker}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-sm font-semibold text-foreground">
                      {formatPercent(p.weight)}
                    </p>
                    <p className="tabular-nums text-[10px] text-muted-foreground">
                      {formatCurrency(p.marketValue, baseCurrency)}
                    </p>
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated/60">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.min(100, p.weight * 100)}%` }}
                  />
                </div>
              </li>
            ))}
            {restWeight > 0 && (
              <li className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Overig ({rest.length})</span>
                <span className="tabular-nums">{formatPercent(restWeight)}</span>
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function CurrencyAllocationCard({
  slices,
  baseCurrency,
  foreignExposure,
}: {
  slices: AllocationSlice[];
  baseCurrency: Currency;
  foreignExposure?: number;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Header
          icon={Globe}
          title="Valuta-verdeling"
          description={
            foreignExposure !== undefined
              ? `${formatPercent(foreignExposure)} buiten ${baseCurrency}.`
              : `Base currency: ${baseCurrency}.`
          }
        />
        {slices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen exposure-data.</p>
        ) : (
          <ul className="space-y-2">
            {slices.map((slice) => (
              <li key={slice.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={cn(
                      "font-medium text-foreground",
                      slice.label === baseCurrency && "text-primary",
                    )}
                  >
                    {slice.label}
                    {slice.label === baseCurrency && (
                      <span className="ml-2 rounded-sm bg-primary/15 px-1 text-[9px] uppercase tracking-wider text-primary">
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
                    className={cn(
                      "h-full rounded-full",
                      slice.label === baseCurrency
                        ? "bg-primary/70"
                        : "bg-muted-foreground/40",
                    )}
                    style={{ width: `${Math.min(100, slice.weight * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Header({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Coins;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {title}
        </p>
        <p className="text-sm text-foreground">{description}</p>
      </div>
    </div>
  );
}
