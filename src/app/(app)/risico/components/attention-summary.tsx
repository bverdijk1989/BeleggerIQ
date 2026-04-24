import { CheckCircle2, ListChecks, ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { Currency } from "@/types/common";
import type { RebalanceQuantityPlan } from "@/types/rebalance";

import type { AttentionItem, AttentionSeverity } from "../build-attention";

interface AttentionSummaryProps {
  items: AttentionItem[];
  /** Base currency voor de afbouwbedragen in de quantity-regel. */
  baseCurrency: Currency;
}

const SEVERITY_DOT: Record<AttentionSeverity, string> = {
  moderate: "bg-warning",
  high: "bg-destructive/80",
  critical: "bg-destructive",
};

const CATEGORY_LABEL: Record<AttentionItem["category"], string> = {
  risk: "Risico",
  rebalance: "Rebalance",
};

/**
 * "Wat vraagt aandacht" samenvattingslijst onderaan de pagina. Puur
 * presentationeel; `items` komt uit `buildAttentionItems`.
 */
export function AttentionSummary({ items, baseCurrency }: AttentionSummaryProps) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-success/15 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">
              Niets urgents vandaag
            </p>
            <p className="text-xs text-muted-foreground">
              Geen risicosignalen of rebalance-acties die aandacht vragen.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
            <ListChecks className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Wat vraagt aandacht
            </p>
            <p className="text-sm text-foreground">
              Gecombineerde top-signalen uit de risk- en rebalance-engine.
            </p>
          </div>
        </div>
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-md border border-border/60 bg-surface/60 p-3"
            >
              <span
                className={cn(
                  "mt-1 h-2 w-2 shrink-0 rounded-full",
                  SEVERITY_DOT[item.severity],
                )}
              />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <span className="rounded-sm bg-surface-elevated px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {CATEGORY_LABEL[item.category]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.message}
                </p>
                {item.quantityPlan && (
                  <QuantityLine
                    plan={item.quantityPlan}
                    baseCurrency={baseCurrency}
                  />
                )}
              </div>
              {item.severity === "critical" && (
                <ShieldAlert className="mt-1 h-4 w-4 shrink-0 text-destructive" />
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Subregel onder de attention-message: "verkoop indicatief X aandeel voor
 * circa €Y". Geen rekenwerk — alle getallen komen uit het `quantityPlan`
 * dat door de rebalance-engine is gezet. Bij ontbrekende koers of
 * nul-stuks tonen we een expliciete "onvoldoende data"-regel.
 */
function QuantityLine({
  plan,
  baseCurrency,
}: {
  plan: RebalanceQuantityPlan;
  baseCurrency: Currency;
}) {
  const hasPrice = plan.currentPrice !== null;
  if (!hasPrice) {
    return (
      <p className="mt-2 text-xs text-amber-200">
        Onvoldoende koersdata — aantal niet te bepalen.
      </p>
    );
  }
  if (plan.sharesToSell === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Overschrijding kleiner dan één eenheid — geen concrete order nodig.
      </p>
    );
  }
  const isFractional = !Number.isInteger(plan.sharesToSell);
  const unit = isFractional
    ? "stuks"
    : plan.sharesToSell === 1
      ? "eenheid"
      : "eenheden";
  const formattedShares = formatNumber(
    plan.sharesToSell,
    isFractional ? 4 : 0,
  );
  const formattedAmount = formatCurrency(plan.amountToSell, baseCurrency, {
    maximumFractionDigits: 0,
  });
  return (
    <p className="mt-2 text-xs text-foreground">
      <span className="font-medium">Indicatief:</span>{" "}
      verkoop {formattedShares} {unit} voor circa {formattedAmount} — nieuwe
      weging ca. {plan.postSellWeight.toFixed(2)}%.
    </p>
  );
}
