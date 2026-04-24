import { AlertTriangle, Info, TrendingDown } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { Currency } from "@/types/common";
import type { AssetClass } from "@/types/portfolio";
import type {
  RebalanceActionLabel,
  RebalanceQuantityConfidence,
  RebalanceQuantityPlan,
  RebalanceRecommendation,
} from "@/types/rebalance";

/**
 * RebalanceQuantityCard — presentationele component.
 *
 * Rendert de concrete afbouwadviezen uit de rebalance quantity engine.
 * **Geen rekenwerk**: alle getallen (sharesToSell, amountToSell,
 * postSellWeight) komen kant-en-klaar uit `RebalanceQuantityPlan`. Deze
 * component doet uitsluitend:
 *  - Nederlandstalige opmaak (via `formatCurrency` + `formatNumber`).
 *  - Unit-label ("aandelen" / "units" / "stuks") per asset class.
 *  - Confidence-badge mapping.
 *  - Filtering op `action !== NO_ACTION` zodat alleen actionable items
 *    in de lijst komen. De caller kan ook vooraf filteren.
 */

interface RebalanceQuantityCardProps {
  /** Volledige lijst recommendations uit `buildPortfolioView(...).rebalance`. */
  recommendations: RebalanceRecommendation[];
  /** Base currency van het portfolio — voor `formatCurrency`. */
  baseCurrency: Currency;
  /**
   * Map ticker → assetClass zodat we "aandelen" vs "ETF-units" kunnen
   * tonen. Als een ticker ontbreekt wordt "stuks" gebruikt.
   */
  assetClassByTicker?: Map<string, AssetClass>;
}

const ACTION_BADGE_CLASS: Record<RebalanceActionLabel, string> = {
  "geen actie":
    "border-border/60 bg-surface/40 text-muted-foreground",
  "licht afbouwen":
    "border-amber-500/40 bg-amber-500/10 text-amber-200",
  "stevig afbouwen":
    "border-orange-500/40 bg-orange-500/10 text-orange-200",
  heroverwegen:
    "border-red-500/40 bg-red-500/10 text-red-200",
};

const CONFIDENCE_BADGE: Record<RebalanceQuantityConfidence, { label: string; className: string }> = {
  HIGH: {
    label: "Hoge zekerheid",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  },
  MEDIUM: {
    label: "Matige zekerheid",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  },
  LOW: {
    label: "Onvoldoende data",
    className: "border-red-500/40 bg-red-500/10 text-red-200",
  },
};

export function RebalanceQuantityCard({
  recommendations,
  baseCurrency,
  assetClassByTicker,
}: RebalanceQuantityCardProps) {
  const actionable = recommendations.filter(
    (rec) => rec.action !== "NO_ACTION" && rec.quantityPlan !== undefined,
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
            <TrendingDown className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Concrete afbouwadviezen
            </p>
            <p className="text-sm text-foreground">
              Indicatieve aantallen + bedragen per positie die volgens het
              policy-profiel te zwaar wegen.
            </p>
          </div>
        </div>

        {actionable.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-4 text-sm text-muted-foreground">
            Geen posities boven de policy-cap — niets af te bouwen op dit moment.
          </p>
        ) : (
          <ul className="space-y-3">
            {actionable.map((rec) => (
              <RebalanceQuantityRow
                key={rec.ticker}
                ticker={rec.ticker}
                name={rec.name}
                plan={rec.quantityPlan!}
                baseCurrency={baseCurrency}
                assetClass={assetClassByTicker?.get(rec.ticker)}
              />
            ))}
          </ul>
        )}

        <p className="flex items-start gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Indicatief, geen orderadvies; controleer altijd actuele brokerkoers.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Subcomponent — per-positie row
// ============================================================

interface RebalanceQuantityRowProps {
  ticker: string;
  name: string;
  plan: RebalanceQuantityPlan;
  baseCurrency: Currency;
  assetClass?: AssetClass;
}

function RebalanceQuantityRow({
  ticker,
  name,
  plan,
  baseCurrency,
  assetClass,
}: RebalanceQuantityRowProps) {
  const hasPrice = plan.currentPrice !== null;
  const unitLabel = resolveUnitLabel({
    assetClass,
    sharesToSell: plan.sharesToSell,
    isFractional: !Number.isInteger(plan.sharesToSell),
  });

  return (
    <li className="rounded-md border border-border/60 bg-surface/60 p-4">
      {/* Kop: positie + action-badge + confidence-badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{ticker}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider",
              ACTION_BADGE_CLASS[plan.actionLabel],
            )}
          >
            {plan.actionLabel}
          </span>
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-medium",
              CONFIDENCE_BADGE[plan.confidence].className,
            )}
          >
            {CONFIDENCE_BADGE[plan.confidence].label}
          </span>
        </div>
      </div>

      {/* Cijfers-grid */}
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Huidige weging" value={`${plan.currentWeight.toFixed(2)}%`} />
        <Metric label="Targetweging" value={`${plan.targetWeight.toFixed(2)}%`} />
        <Metric
          label={`Afbouwen (${unitLabel})`}
          value={
            hasPrice
              ? formatNumber(plan.sharesToSell, plan.sharesToSell % 1 === 0 ? 0 : 4)
              : "—"
          }
          tone={plan.sharesToSell > 0 ? "warning" : "neutral"}
        />
        <Metric
          label="Indicatief bedrag"
          value={
            hasPrice
              ? formatCurrency(plan.amountToSell, baseCurrency, {
                  maximumFractionDigits: 0,
                })
              : "—"
          }
        />
        <Metric
          label="Weging na verkoop"
          value={`${plan.postSellWeight.toFixed(2)}%`}
        />
        <Metric
          label="Excess t.o.v. target"
          value={formatCurrency(plan.excessValue, baseCurrency, {
            maximumFractionDigits: 0,
          })}
        />
        {hasPrice && (
          <Metric
            label="Huidige koers"
            value={formatCurrency(plan.currentPrice ?? 0, baseCurrency, {
              maximumFractionDigits: 2,
            })}
          />
        )}
      </dl>

      {/* Reason + waarschuwingen */}
      <p className="mt-3 text-sm text-muted-foreground">{plan.reason}</p>
      {plan.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {plan.warnings.map((w, i) => (
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
    </li>
  );
}

// ============================================================
//  Helpers (puur presentatie)
// ============================================================

function Metric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 font-mono text-sm",
          tone === "warning" ? "text-amber-200" : "text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Bepaal unit-label op basis van assetClass + fractioneel of niet.
 * Single stock = "aandeel/aandelen"; ETF = "units" (fondseenheid);
 * fractional = "stuks" (neutraal); BOND = "stuks". Simpele heuristiek,
 * consistent met het taalgebruik op /portfolio.
 */
function resolveUnitLabel({
  assetClass,
  sharesToSell,
  isFractional,
}: {
  assetClass?: AssetClass;
  sharesToSell: number;
  isFractional: boolean;
}): string {
  if (isFractional) return "stuks";
  if (!assetClass) return "stuks";
  switch (assetClass) {
    case "EQUITY":
    case "REIT":
      return sharesToSell === 1 ? "aandeel" : "aandelen";
    case "ETF":
      return sharesToSell === 1 ? "unit" : "units";
    case "BOND":
    case "COMMODITY":
    case "CRYPTO":
    case "CASH":
    case "OTHER":
    default:
      return "stuks";
  }
}
