import { AlertTriangle, Calculator, Info, Receipt, ScaleIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { TaxReport } from "@/lib/analytics";
import { cn, formatCurrency } from "@/lib/utils";
import type { Currency } from "@/types/common";

/**
 * NetReturnCard — pure presentatie van een `TaxReport`.
 *
 * Toont:
 *   - Bruto / tax-impact / netto rendement (% en bedragen)
 *   - Box 3-uitsplitsing (vrijstelling, forfait, belasting)
 *   - Dividend-tax breakdown (NL + buitenlands)
 *   - Warnings per holding/structuur
 *   - Disclaimer "indicatief, geen fiscaal advies"
 */

interface Props {
  report: TaxReport;
  /** Bron van het bruto-return-cijfer voor transparantie. */
  grossReturnSource?: "TWR_12M" | "UNREALIZED_PROXY" | "ZERO";
}

const SOURCE_LABEL: Record<NonNullable<Props["grossReturnSource"]>, string> = {
  TWR_12M: "Bron bruto-return: TWR (trailing 12m, contributions gefilterd).",
  UNREALIZED_PROXY:
    "Bron bruto-return: unrealized P&L sinds aankoop (proxy — onvoldoende snapshots voor TWR).",
  ZERO: "Bron bruto-return: 0 — geen data beschikbaar.",
};

export function NetReturnCard({ report, grossReturnSource }: Props) {
  const r = report.result;
  const tone = r.netReturn >= 0 ? "good" : "bad";

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-primary">
            <Receipt className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Netto rendement
            </p>
            <p className="text-sm text-foreground">
              Indicatief: bruto rendement min box 3 en niet-verrekenbare WHT.
              Belastingjaar {report.taxYear}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <ReturnTile
            label="Bruto"
            pct={r.grossReturn}
            amount={r.amounts.grossReturnAmount}
            currency={report.baseCurrency}
            tone="neutral"
          />
          <ReturnTile
            label="Belasting"
            pct={r.taxImpact}
            amount={-r.amounts.taxAmount}
            currency={report.baseCurrency}
            tone="bad"
          />
          <ReturnTile
            label="Netto"
            pct={r.netReturn}
            amount={r.amounts.netReturnAmount}
            currency={report.baseCurrency}
            tone={tone}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 border-t border-border/60 pt-3 sm:grid-cols-3">
          <Detail
            icon={<ScaleIcon className="h-3.5 w-3.5" />}
            label="Box 3"
            value={formatCurrency(r.amounts.box3Tax, report.baseCurrency, {
              maximumFractionDigits: 0,
            })}
            helper={`forfait ${(r.box3.notionalReturnRate * 100).toFixed(2)}% × tarief ${(r.box3.taxRate * 100).toFixed(0)}%`}
          />
          <Detail
            icon={<Calculator className="h-3.5 w-3.5" />}
            label="NL dividendbelasting"
            value={formatCurrency(r.amounts.dividendTax, report.baseCurrency, {
              maximumFractionDigits: 0,
            })}
            helper="15%, volledig verrekenbaar via aangifte"
          />
          <Detail
            icon={<Calculator className="h-3.5 w-3.5" />}
            label="Buitenlandse WHT"
            value={formatCurrency(r.amounts.foreignWht, report.baseCurrency, {
              maximumFractionDigits: 0,
            })}
            helper={`waarvan ${formatCurrency(Math.max(0, r.dividend.foreignWithholdingTax + r.dividend.dutchDividendTax - r.dividend.creditableTax), report.baseCurrency, { maximumFractionDigits: 0 })} niet verrekenbaar`}
          />
        </div>

        {r.warnings.length > 0 && (
          <ul className="space-y-1 border-t border-border/60 pt-3">
            {r.warnings.map((w, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-xs text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        {grossReturnSource && (
          <p className="text-[11px] text-muted-foreground">
            {SOURCE_LABEL[grossReturnSource]}
          </p>
        )}

        <p className="flex items-start gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Indicatief model — <strong>geen fiscaal of juridisch advies</strong>.
            Tarieven {report.taxYear}; controleer altijd je aangifte met
            een belastingadviseur of de Belastingdienst.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Tiles
// ============================================================

function ReturnTile({
  label,
  pct,
  amount,
  currency,
  tone,
}: {
  label: string;
  pct: number;
  amount: number;
  currency: Currency;
  tone: "good" | "bad" | "neutral";
}) {
  const className =
    tone === "good"
      ? "border-success/40 bg-success/10 text-success"
      : tone === "bad"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border/60 bg-surface/40 text-foreground";
  return (
    <div className={cn("rounded-md border p-3", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] opacity-80">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums">
        {(pct * 100).toFixed(2)}%
      </p>
      <p className="mt-0.5 font-mono text-[11px] tabular-nums opacity-80">
        {formatCurrency(amount, currency, { maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-2">
      <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
        {value}
      </dd>
      {helper && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}
