import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DividendYearBucket } from "@/lib/tax/dividend-overview";
import { cn } from "@/lib/utils";

interface DividendOverviewTableProps {
  buckets: DividendYearBucket[];
}

function formatMoney(n: number, ccy: string): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}${Math.abs(n).toLocaleString("nl-NL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${ccy}`;
}

export function DividendOverviewTable({ buckets }: DividendOverviewTableProps) {
  if (buckets.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Nog geen dividend-rijen geïmporteerd. Importeer een DEGIRO-CSV via{" "}
          <a className="underline" href="/transacties">
            /transacties
          </a>
          .
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      {buckets.map((yb) => (
        <Card key={yb.year}>
          <CardHeader className="flex flex-row items-baseline justify-between gap-3">
            <CardTitle>{yb.year}</CardTitle>
            {yb.totals.currency && (
              <p className="text-xs text-muted-foreground">
                Totaal bruto:{" "}
                <span className="tabular-nums text-foreground">
                  {formatMoney(yb.totals.gross, yb.totals.currency)}
                </span>{" "}
                · ingehouden{" "}
                <span className="tabular-nums text-warning">
                  {formatMoney(yb.totals.withheld, yb.totals.currency)}
                </span>{" "}
                · verrekenbaar (theoretisch){" "}
                <span className="tabular-nums text-primary">
                  {formatMoney(yb.totals.reclaimable, yb.totals.currency)}
                </span>
              </p>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-surface-elevated text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Bronland</th>
                    <th className="px-3 py-2 text-right">Bruto</th>
                    <th className="px-3 py-2 text-right">Ingehouden</th>
                    <th className="px-3 py-2 text-right">Verrekenbaar</th>
                    <th className="px-3 py-2 text-right">Tarief</th>
                    <th className="px-3 py-2 text-left">Toelichting</th>
                  </tr>
                </thead>
                <tbody>
                  {yb.byCountry.map((c) => (
                    <tr
                      key={`${c.countryCode}-${c.currency}`}
                      className="border-t border-border/40"
                    >
                      <td className="px-3 py-2">
                        <p className="font-medium text-foreground">
                          {c.country}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {c.events} event{c.events === 1 ? "" : "s"} · {c.currency}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMoney(c.gross, c.currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-warning">
                        {formatMoney(c.withheld, c.currency)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          c.reclaimable > 0 && "text-primary font-medium",
                        )}
                      >
                        {formatMoney(c.reclaimable, c.currency)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
                        {(c.defaultRate * 100).toFixed(1)}% std ·{" "}
                        {(c.treatyRate * 100).toFixed(1)}% verdrag
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {c.note ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
