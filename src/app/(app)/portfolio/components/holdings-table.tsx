"use client";

import { ScorePill } from "@/components/common/score-pill";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn, formatCurrency, formatNumber, formatPercent } from "@/lib/utils";
import type { HoldingAction } from "@/lib/analytics/holding-action";
import type { Currency } from "@/types/common";
import type { FactorRationales } from "@/types/factor";

import { ActionBadge } from "./action-badge";
import { ResearchDossierButton } from "./research-dossier-button";

/**
 * Serialiseerbare row-shape voor de tabel. De page bouwt deze rows met
 * analytics-helpers zodat deze component puur presentationeel blijft.
 */
export interface HoldingRow {
  id: string;
  name: string;
  ticker: string;
  assetClass: string;
  sector?: string | null;
  quantity: number;
  unitPrice: number;
  sourceCurrency: Currency;
  marketValueBase: number;
  unrealizedPnlBase: number;
  unrealizedPnlPct: number;
  weight: number;
  scores: {
    quality: number | null;
    value: number | null;
    momentum: number | null;
    composite: number | null;
  };
  rationales: FactorRationales | null;
  action: HoldingAction;
  actionRationale: string;
}

interface HoldingsTableProps {
  rows: HoldingRow[];
  baseCurrency: Currency;
}

export function HoldingsTable({ rows, baseCurrency }: HoldingsTableProps) {
  if (rows.length === 0) return null;

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={0}>
      <div className="overflow-x-auto rounded-md border border-border/60">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-surface-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Positie</th>
              <th className="hidden px-3 py-2 text-left font-medium md:table-cell">
                Symbool
              </th>
              <th className="hidden px-3 py-2 text-right font-medium md:table-cell">
                Aantal
              </th>
              <th className="hidden px-3 py-2 text-right font-medium md:table-cell">
                Koers
              </th>
              <th className="px-3 py-2 text-right font-medium">Waarde</th>
              <th className="px-3 py-2 text-right font-medium">%</th>
              <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">
                Valuta
              </th>
              <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">
                Quality
              </th>
              <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">
                Value
              </th>
              <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">
                Momentum
              </th>
              <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">
                Totaal
              </th>
              <th className="px-3 py-2 text-right font-medium">Actie</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {rows.map((row) => (
              <HoldingRowView
                key={row.id}
                row={row}
                baseCurrency={baseCurrency}
              />
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

interface HoldingRowViewProps {
  row: HoldingRow;
  baseCurrency: Currency;
}

function HoldingRowView({ row, baseCurrency }: HoldingRowViewProps) {
  const pnlClass =
    row.unrealizedPnlBase > 0
      ? "text-success"
      : row.unrealizedPnlBase < 0
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <tr className="hover:bg-surface-elevated/40">
      <td className="px-3 py-2">
        <div className="font-medium text-foreground">{row.name}</div>
        <div className="text-xs text-muted-foreground">
          <span className="md:hidden">{row.ticker} · </span>
          {row.assetClass}
          {row.sector ? ` · ${row.sector}` : ""}
        </div>
      </td>
      <td className="hidden px-3 py-2 font-mono text-xs text-foreground md:table-cell">
        {row.ticker}
      </td>
      <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">
        {formatNumber(row.quantity, row.quantity % 1 === 0 ? 0 : 4)}
      </td>
      <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">
        {formatCurrency(row.unitPrice, row.sourceCurrency)}
      </td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">
        {formatCurrency(row.marketValueBase, baseCurrency)}
        <div className={cn("text-xs tabular-nums", pnlClass)}>
          {formatPercent(row.unrealizedPnlPct)}
        </div>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
        {formatPercent(row.weight)}
      </td>
      <td className="hidden px-3 py-2 text-right font-mono text-xs text-muted-foreground lg:table-cell">
        {row.sourceCurrency}
      </td>
      <td className="hidden px-3 py-2 text-right lg:table-cell">
        <ScorePill
          score={row.scores.quality}
          label="Quality"
          tooltip={
            <FactorTooltip
              title="Quality"
              description="ROIC, ROE, marges, balans en cashflow-kwaliteit."
              score={row.scores.quality}
              rationales={row.rationales?.quality}
            />
          }
        />
      </td>
      <td className="hidden px-3 py-2 text-right lg:table-cell">
        <ScorePill
          score={row.scores.value}
          label="Value"
          tooltip={
            <FactorTooltip
              title="Value"
              description="P/E, PEG, EV/EBITDA, P/B en FCF-yield."
              score={row.scores.value}
              rationales={row.rationales?.value}
            />
          }
        />
      </td>
      <td className="hidden px-3 py-2 text-right lg:table-cell">
        <ScorePill
          score={row.scores.momentum}
          label="Momentum"
          tooltip={
            <FactorTooltip
              title="Momentum"
              description="6m-, 12m- en 12-1m trend plus afstand tot 52w-high."
              score={row.scores.momentum}
              rationales={row.rationales?.momentum}
            />
          }
        />
      </td>
      <td className="hidden px-3 py-2 text-right lg:table-cell">
        <ScorePill
          score={row.scores.composite}
          label="Composite"
          className="font-semibold"
          tooltip={
            <FactorTooltip
              title="Totaalscore"
              description="Gewogen combinatie van quality, value, momentum en risk."
              score={row.scores.composite}
              rationales={row.rationales?.composite}
            />
          }
        />
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex flex-col items-end gap-1">
          <ActionBadge action={row.action} rationale={row.actionRationale} />
          <ResearchDossierButton ticker={row.ticker} label={row.name} />
        </div>
      </td>
    </tr>
  );
}

interface FactorTooltipProps {
  title: string;
  description: string;
  score: number | null;
  rationales?: string[];
}

function FactorTooltip({
  title,
  description,
  score,
  rationales,
}: FactorTooltipProps) {
  return (
    <div className="space-y-2">
      <div>
        <p className="font-medium text-foreground">
          {title}
          {score !== null && (
            <span className="ml-2 text-muted-foreground">
              {Math.round(score)}/100
            </span>
          )}
        </p>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {rationales && rationales.length > 0 && (
        <ul className="space-y-1 border-t border-border/40 pt-2 text-foreground">
          {rationales.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
