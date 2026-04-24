import Link from "next/link";
import { ArrowRight, CheckCircle2, ListChecks } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  AttentionItem,
  AttentionSeverity,
} from "@/lib/analytics/attention";
import { cn } from "@/lib/utils";

interface NextActionCardProps {
  items: AttentionItem[];
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
 * "Wat nu doen" card — hoofdactieblok op het dashboard. Toont top 4
 * geprioriteerde items uit de attention-builder. Bij 0 items een
 * kalme "alles rustig"-staat zodat de cockpit niet dooddraait.
 */
export function NextActionCard({ items }: NextActionCardProps) {
  const top = items.slice(0, 4);

  if (top.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-success/15 text-success">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Wat nu doen
            </p>
            <p className="text-sm font-medium text-foreground">
              Niets urgents — je portefeuille loopt binnen de policy.
            </p>
            <p className="text-xs text-muted-foreground">
              Handhaven en maandritme volgen. Zie /maandbeslissing voor de
              volgende inleg.
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href="/maandbeslissing">
              Naar maandbeslissing <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
              <ListChecks className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Wat nu doen
              </p>
              <p className="text-sm text-foreground">
                Top prioriteiten uit risk + rebalance, op volgorde van ernst.
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/risico">
              Risicocentrum <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {top.map((item) => (
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
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
