import type { LucideIcon } from "lucide-react";
import { Briefcase, Coins, Globe } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatPercent } from "@/lib/utils";
import type { AllocationSlice } from "@/types/allocation";
import type { Currency } from "@/types/common";
import type { PortfolioRiskSummary } from "@/types/risk";

/**
 * Drie gedeelde exposure-kaarten: concentratie, valuta-verdeling en
 * sector-verdeling. Visueel consistent met elkaar — één component,
 * verschillende content, zodat de risicopagina rustig oogt.
 */

export function ConcentrationOverviewCard({
  risk,
}: {
  risk: PortfolioRiskSummary;
}) {
  const rows: StatRow[] = [
    {
      label: "HHI (concentratie)",
      value: risk.concentrationHhi.toFixed(2),
      hint: "1/n = gelijke spreiding, hoger = meer concentratie",
    },
    {
      label: "Top 5 weegt",
      value:
        risk.top5Weight !== undefined ? formatPercent(risk.top5Weight) : "—",
    },
    {
      label: "Grootste positie",
      value: formatPercent(risk.largestPositionWeight),
    },
  ];
  return (
    <OverviewCard
      title="Concentratie"
      description="Hoe zwaar leunt je portefeuille op enkele posities."
      icon={Briefcase}
      rows={rows}
    />
  );
}

export function CurrencyExposureCard({
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
          title="Valuta-exposure"
          description="Verdeling over base en vreemde valuta."
        />
        {foreignExposure !== undefined && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {formatPercent(foreignExposure)}
            </span>{" "}
            staat buiten {baseCurrency}.
          </p>
        )}
        <AllocationBars slices={slices} highlightLabel={baseCurrency} />
      </CardContent>
    </Card>
  );
}

export function SectorExposureCard({
  slices,
  topSector,
}: {
  slices: AllocationSlice[];
  topSector?: { label: string; weight: number };
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Header
          icon={Coins}
          title="Sector-verdeling"
          description={
            topSector
              ? `Zwaartepunt: ${topSector.label} (${formatPercent(topSector.weight)}).`
              : "Sectorverdeling op marktwaarde."
          }
        />
        <AllocationBars slices={slices} highlightLabel={topSector?.label} />
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Shared UI
// ============================================================

interface StatRow {
  label: string;
  value: string;
  hint?: string;
}

function OverviewCard({
  title,
  description,
  icon,
  rows,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  rows: StatRow[];
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <Header icon={icon} title={title} description={description} />
        <dl className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-4">
              <div>
                <dt className="text-xs font-medium text-foreground">
                  {row.label}
                </dt>
                {row.hint && (
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {row.hint}
                  </p>
                )}
              </div>
              <dd className="tabular-nums text-sm font-semibold text-foreground">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function Header({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
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

function AllocationBars({
  slices,
  highlightLabel,
  max = 6,
}: {
  slices: AllocationSlice[];
  highlightLabel?: string;
  max?: number;
}) {
  if (slices.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Geen exposure-data.</p>
    );
  }
  const visible = slices.slice(0, max);
  const rest = slices.slice(max);
  const restWeight = rest.reduce((sum, s) => sum + s.weight, 0);

  return (
    <ul className="space-y-2">
      {visible.map((slice) => (
        <li key={slice.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span
              className={cn(
                "font-medium text-foreground",
                slice.label === highlightLabel && "text-primary",
              )}
            >
              {slice.label}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatPercent(slice.weight)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated/60">
            <div
              className={cn(
                "h-full rounded-full",
                slice.label === highlightLabel ? "bg-primary/70" : "bg-muted-foreground/40",
              )}
              style={{ width: `${Math.min(100, slice.weight * 100)}%` }}
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
  );
}
