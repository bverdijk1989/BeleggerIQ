import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardOpportunity } from "@/lib/analytics";

import { OpportunityCard } from "./opportunity-card";

/**
 * OpportunityPanel — toont de top-3 dashboard-opportunities (uit
 * `prioritizeOpportunities`) als action-georiënteerde kaarten.
 *
 * UX:
 *  - Header met "Naar /kansen"-link voor deep-dive.
 *  - Empty state wanneer er geen kansen boven drempel zijn.
 *  - Op desktop stapelt de stack verticaal (rechterkolom naast risico's);
 *    callers kunnen via `layout="grid"` schakelen naar 2-koloms grid op
 *    een bredere viewport.
 */

interface Props {
  opportunities: DashboardOpportunity[];
  /** "stack" stapelt verticaal (default), "grid" toont 2-koloms vanaf md. */
  layout?: "stack" | "grid";
}

const VISIBLE = 3;

export function OpportunityPanel({
  opportunities,
  layout = "stack",
}: Props) {
  const visible = opportunities.slice(0, VISIBLE);
  const overflow = Math.max(0, opportunities.length - VISIBLE);
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
                Kansen op je radar
              </p>
              <p className="text-sm text-foreground">
                {visible.length === 0
                  ? "Geen kansen actief."
                  : `Top ${visible.length} — onderzoeken, bijkopen of wachten.`}
              </p>
            </div>
          </div>
          <Link
            href="/kansen"
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            aria-label="Bekijk alle kansen"
          >
            Bekijk alles <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-3 text-sm text-muted-foreground">
            Geen kansen boven de drempel — Opportunity Radar wacht op nieuwe
            signalen. Kom later vandaag of morgen terug.
          </p>
        ) : (
          <>
            <div
              className={
                layout === "grid"
                  ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
                  : "flex flex-col gap-3"
              }
            >
              {visible.map((o, i) => (
                <OpportunityCard
                  key={o.id}
                  opportunity={o}
                  rank={{ current: i + 1, total: opportunities.length }}
                />
              ))}
            </div>
            {overflow > 0 && (
              <p className="text-[10px] text-muted-foreground">
                + {overflow} meer — bekijk alles in /kansen.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
