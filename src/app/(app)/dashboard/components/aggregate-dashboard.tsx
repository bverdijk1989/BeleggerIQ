import { Layers } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AggregateResult } from "@/lib/portfolios";
import { cn } from "@/lib/utils";

interface AggregateDashboardProps {
  result: AggregateResult;
  /** Diepe link naar elke portefeuille zodat de UI snel kan inzoomen. */
  buildHref: (portfolioId: string) => string;
}

function fmtMoney(value: number, ccy: string): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${Math.abs(value).toLocaleString("nl-NL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} ${ccy}`;
}

function fmtPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/**
 * Aggregate overzicht: totale waarde, totale PnL, en allocatie per
 * portefeuille. Géén engines (factor/risk/decision) — die zijn
 * portefeuille-specifiek; aggregate-view leidt de gebruiker terug naar
 * een specifieke portefeuille voor diepere analyse.
 */
export function AggregateDashboard({
  result,
  buildHref,
}: AggregateDashboardProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
        <Layers className="h-4 w-4" />
        <span>
          <strong>Alle portefeuilles</strong> — aggregaat van{" "}
          {result.byPortfolio.length} portefeuilles. Switch naar een
          specifieke portefeuille voor factor-, risico- en decision-analytics.
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <KpiCard
          label="Totale waarde"
          value={fmtMoney(result.totalValue, result.baseCurrency)}
        />
        <KpiCard
          label="Totale kostprijs"
          value={fmtMoney(result.totalCost, result.baseCurrency)}
          tone="muted"
        />
        <KpiCard
          label="Ongerealiseerde P&L"
          value={fmtMoney(result.unrealizedPnl, result.baseCurrency)}
          tone={result.unrealizedPnl >= 0 ? "success" : "destructive"}
          subline={fmtPct(result.unrealizedPnlPct)}
        />
      </div>

      {result.fxMismatchCount > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          {result.fxMismatchCount} van je portefeuilles draait in een andere
          basisvaluta dan {result.baseCurrency}. De aggregaat-cijfers tellen
          ze nominaal op — voer een FX-conversie uit voor een exact totaal.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Allocatie per portefeuille</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-surface-elevated text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Portefeuille</th>
                  <th className="px-3 py-2 text-right">Waarde</th>
                  <th className="px-3 py-2 text-right">P&L</th>
                  <th className="px-3 py-2 text-right">Gewicht</th>
                  <th className="px-3 py-2 text-right">Posities</th>
                  <th className="px-3 py-2 text-left">Currency</th>
                </tr>
              </thead>
              <tbody>
                {result.byPortfolio.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-border/40 hover:bg-surface-elevated/40"
                  >
                    <td className="px-3 py-2">
                      <a
                        href={buildHref(p.id)}
                        className="font-medium text-primary hover:underline"
                      >
                        {p.name}
                      </a>
                      {p.isPrimary && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          primair
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMoney(p.totalValue, p.baseCurrency)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        p.unrealizedPnl >= 0
                          ? "text-success"
                          : "text-destructive",
                      )}
                    >
                      {fmtMoney(p.unrealizedPnl, p.baseCurrency)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtPct(p.weight)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.holdings}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {p.baseCurrency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  subline,
  tone = "default",
}: {
  label: string;
  value: string;
  subline?: string;
  tone?: "default" | "muted" | "success" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums",
            tone === "muted" && "text-muted-foreground",
            tone === "success" && "text-success",
            tone === "destructive" && "text-destructive",
          )}
        >
          {value}
        </p>
        {subline && (
          <p className="text-xs text-muted-foreground tabular-nums">{subline}</p>
        )}
      </CardContent>
    </Card>
  );
}
