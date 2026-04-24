import { Card, CardContent } from "@/components/ui/card";
import { cn, formatPercent } from "@/lib/utils";
import type { HoldingValuation } from "@/lib/analytics/valuation";
import type { Currency } from "@/types/common";
import type {
  PositionRiskAnalysis,
  RiskSeverity,
} from "@/types/risk";

import { SEVERITY_LABEL_NL, TONE_BG, toneForSeverity } from "../severity";

interface RiskPositionsTableProps {
  positions: PositionRiskAnalysis[];
  valuations: HoldingValuation[];
  baseCurrency: Currency;
  limit?: number;
}

/**
 * Tabel met grootste risicoposities. Sorteert primair op riskScore desc,
 * secundair op concentratiegewicht. Weergave is server-rendered; klik-acties
 * vallen buiten scope (navigatie komt later).
 */
export function RiskPositionsTable({
  positions,
  valuations,
  baseCurrency,
  limit = 10,
}: RiskPositionsTableProps) {
  const rows = buildRows(positions, valuations, baseCurrency).slice(0, limit);

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Grootste risicoposities
            </p>
            <p className="text-sm text-muted-foreground">
              Op risicoscore (combinatie van concentratie, volatiliteit en valuta).
            </p>
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {rows.length} van {positions.length}
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen posities om risico op te tonen.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border/60">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Positie</th>
                  <th className="px-3 py-2 text-right font-medium">Weight</th>
                  <th className="hidden px-3 py-2 text-center font-medium md:table-cell">
                    Concentratie
                  </th>
                  <th className="hidden px-3 py-2 text-center font-medium md:table-cell">
                    Volatiliteit
                  </th>
                  <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">
                    FX-bijdrage
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((row) => (
                  <tr key={row.ticker} className="hover:bg-surface-elevated/40">
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">
                        {row.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {row.ticker} · {row.currency}
                        {row.currency !== baseCurrency && " · vreemd"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPercent(row.weight)}
                    </td>
                    <td className="hidden px-3 py-2 text-center md:table-cell">
                      <SeverityPill severity={row.concentrationClass} />
                    </td>
                    <td className="hidden px-3 py-2 text-center md:table-cell">
                      <SeverityPill severity={row.volatilityClass} />
                    </td>
                    <td className="hidden px-3 py-2 text-right tabular-nums lg:table-cell">
                      {row.currencyContribution > 0
                        ? formatPercent(row.currencyContribution)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <RiskScoreBadge score={row.riskScore} severity={row.riskClass} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Row helpers (pure)
// ============================================================

interface Row {
  ticker: string;
  name: string;
  weight: number;
  concentrationClass: RiskSeverity;
  volatilityClass: RiskSeverity;
  currencyContribution: number;
  riskScore: number;
  riskClass: RiskSeverity;
  currency: Currency;
}

function buildRows(
  positions: PositionRiskAnalysis[],
  valuations: HoldingValuation[],
  _baseCurrency: Currency,
): Row[] {
  const nameByTicker = new Map<string, { name: string; currency: Currency }>();
  for (const v of valuations) {
    nameByTicker.set(v.holding.ticker, {
      name: v.holding.name,
      currency: v.holding.currency,
    });
  }

  return positions
    .map<Row>((p) => {
      const meta = nameByTicker.get(p.ticker);
      return {
        ticker: p.ticker,
        name: meta?.name ?? p.ticker,
        weight: p.concentrationWeight,
        concentrationClass: p.concentrationClass ?? "moderate",
        volatilityClass: p.volatilityClass ?? "moderate",
        currencyContribution: p.currencyRiskContribution ?? 0,
        riskScore: p.riskScore ?? 50,
        riskClass: p.riskClass ?? "moderate",
        currency: meta?.currency ?? "EUR",
      };
    })
    .sort((a, b) => {
      const delta = b.riskScore - a.riskScore;
      if (delta !== 0) return delta;
      return b.weight - a.weight;
    });
}

// ============================================================
//  Visuals
// ============================================================

function SeverityPill({ severity }: { severity: RiskSeverity }) {
  const tone = toneForSeverity(severity);
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        TONE_BG[tone],
      )}
    >
      {SEVERITY_LABEL_NL[severity]}
    </span>
  );
}

function RiskScoreBadge({
  score,
  severity,
}: {
  score: number;
  severity: RiskSeverity;
}) {
  const tone = toneForSeverity(severity);
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span
        className={cn(
          "inline-flex min-w-[2.5rem] justify-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums",
          TONE_BG[tone],
        )}
      >
        {Math.round(score)}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {SEVERITY_LABEL_NL[severity]}
      </span>
    </div>
  );
}
