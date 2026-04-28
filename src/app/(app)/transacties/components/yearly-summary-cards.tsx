import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { YearlyBucket } from "@/lib/transactions/summary";

interface YearlySummaryCardsProps {
  buckets: YearlyBucket[];
}

function formatMoney(value: number, currency: string): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${abs.toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function YearlySummaryCards({ buckets }: YearlySummaryCardsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {buckets.map((b) => (
        <Card key={`${b.year}|${b.currency}`}>
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {b.year}
              </p>
              <span className="rounded-md bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {b.currency}
              </span>
            </div>

            <Stat
              label="Realized PnL"
              value={formatMoney(b.realizedPnl, b.currency)}
              tone={b.realizedPnl >= 0 ? "success" : "destructive"}
            />

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <Stat
                small
                label="Dividenden"
                value={formatMoney(b.dividends, b.currency)}
              />
              <Stat
                small
                label="Belasting"
                value={formatMoney(b.taxes, b.currency)}
                tone="warning"
              />
              <Stat
                small
                label="Fees"
                value={formatMoney(b.fees, b.currency)}
                tone="warning"
              />
              <Stat
                small
                label="Rente"
                value={formatMoney(b.interest, b.currency)}
              />
            </div>

            <div className="border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
              {b.trades} trade{b.trades === 1 ? "" : "s"} ·{" "}
              {b.events} totaal events
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive" | "warning";
  small?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          small ? "text-xs font-medium" : "text-base font-semibold",
          tone === "success" && "text-success",
          tone === "destructive" && "text-destructive",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </span>
    </div>
  );
}
