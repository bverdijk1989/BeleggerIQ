import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardRiskAction } from "@/lib/analytics";

import { RiskActionCard } from "./risk-action-card";

/**
 * RiskActionPanel — toont de top-3 risico's als concrete actiekaarten
 * (uit `buildRiskActions`). Pure presentatie:
 *  - Header met titel + "Naar /risico"-link.
 *  - Empty state wanneer er geen risico's zijn.
 *  - Op desktop: 3 kolommen; op mobile stapelt de stack.
 *
 * Geen rekenwerk in deze component — alle title/impact/recommendedAction
 * zinnen + aantallen komen uit de mapper.
 */

interface Props {
  actions: DashboardRiskAction[];
}

const VISIBLE = 3;

export function RiskActionPanel({ actions }: Props) {
  const visible = actions.slice(0, VISIBLE);
  const overflow = Math.max(0, actions.length - VISIBLE);
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
                Risico&apos;s &amp; acties
              </p>
              <p className="text-sm text-foreground">
                {visible.length === 0
                  ? "Geen actieve risico-flags."
                  : `Top ${visible.length} — elk met een concrete actie.`}
              </p>
            </div>
          </div>
          <Link
            href="/risico"
            className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-surface/40 px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
            aria-label="Bekijk alle risico's"
          >
            Bekijk alles <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-3 text-sm text-muted-foreground">
            Geen risico-flags actief — alle engines (risk, rebalance, policy,
            datakwaliteit) zien de portefeuille binnen profielgrenzen.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((a, i) => (
                <RiskActionCard
                  key={a.id}
                  action={a}
                  rank={{ current: i + 1, total: actions.length }}
                />
              ))}
            </div>
            {overflow > 0 && (
              <p className="text-[10px] text-muted-foreground">
                + {overflow} meer risico-flag{overflow === 1 ? "" : "s"} —
                bekijk alles in /risico.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
