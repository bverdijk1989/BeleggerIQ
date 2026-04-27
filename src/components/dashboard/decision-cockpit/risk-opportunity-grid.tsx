import Link from "next/link";
import { ArrowRight, Sparkles, ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { OpportunitySource } from "@/lib/analytics";
import { cn } from "@/lib/utils";

import type {
  OpportunityListVM,
  RiskItemVM,
  RiskListVM,
} from "./view-model";

/**
 * RiskOpportunityGrid — twee kolommen onder de viewport-zone.
 *
 * Links: top-5 risico's uit de attention-engine.
 * Rechts: top-5 kansen uit de opportunity-radar.
 *
 * Beide kolommen hebben hun eigen Card en empty state. We exposen
 * de namespace-component zowel als één geheel (voor compactness)
 * als twee subcomponents (`RisksCard` / `OpportunitiesCard`) zodat
 * de layout-host ze in aparte slots kan plaatsen.
 */

interface Props {
  risks: RiskListVM;
  opportunities: OpportunityListVM;
}

export function RiskOpportunityGrid({ risks, opportunities }: Props) {
  return (
    <>
      <RisksCard data={risks} />
      <OpportunitiesCard data={opportunities} />
    </>
  );
}

RiskOpportunityGrid.Risks = RisksCard;
RiskOpportunityGrid.Opportunities = OpportunitiesCard;

export { RisksCard, OpportunitiesCard };

// ============================================================
//  Risks card
// ============================================================

const SEVERITY_DOT: Record<RiskItemVM["severity"], string> = {
  critical: "bg-destructive",
  high: "bg-destructive",
  elevated: "bg-warning",
  moderate: "bg-warning/70",
  low: "bg-muted-foreground/60",
};

function RisksCard({ data }: { data: RiskListVM }) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/15 text-destructive">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Risico's & problemen
              </p>
              <p className="text-sm text-foreground">
                Top-5 aandachtspunten uit risk- en rebalance-engine.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-border/60 bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {data.total}
            </span>
            <Link
              href="/risico"
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
              aria-label="Open risico-pagina"
            >
              Naar /risico <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {data.items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-3 text-sm text-muted-foreground">
            Geen actieve risico-flags. Engine ziet de portefeuille rustig
            verdeeld.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.items.map((item, i) => (
              <li
                key={`${item.label}-${i}`}
                className="flex items-start gap-3 rounded-md border border-border/60 bg-surface/60 p-3"
              >
                <span
                  className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                    SEVERITY_DOT[item.severity],
                  )}
                  aria-label={`Severity ${item.severity}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {item.severity}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
//  Opportunities card
// ============================================================

const SOURCE_LABEL: Record<OpportunitySource, string> = {
  portfolio: "Portefeuille",
  screener: "Screener",
  watchlist: "Watchlist",
};

function OpportunitiesCard({ data }: { data: OpportunityListVM }) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Kansen & opportunities
              </p>
              <p className="text-sm text-foreground">
                Top-5 kandidaten uit de opportunity-radar.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-border/60 bg-surface-elevated px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {data.total}
            </span>
            <Link
              href="/kansen"
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
              aria-label="Open kansen-pagina"
            >
              Naar /kansen <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {data.items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-3 text-sm text-muted-foreground">
            Geen kansen boven de drempel. Engine wacht op nieuwe signalen.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.items.map((item, i) => (
              <li
                key={`${item.symbol}-${i}`}
                className="flex items-start gap-3 rounded-md border border-border/60 bg-surface/60 p-3"
              >
                <span className="mt-0.5 rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  #{i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.name}
                    </p>
                    <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                      {Math.round(item.score)}/100
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="font-mono">{item.symbol}</span>
                    <span className="rounded-sm bg-surface-elevated/60 px-1.5 py-0.5 text-[10px]">
                      {SOURCE_LABEL[item.source]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.summary}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
