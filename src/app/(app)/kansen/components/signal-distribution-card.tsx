import { BarChart3 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import {
  OPPORTUNITY_SIGNAL_TYPES,
  SIGNAL_LABELS,
  SIGNAL_TONE,
  type OpportunityReport,
  type OpportunitySignalType,
} from "@/lib/analytics/opportunity-radar";
import { cn } from "@/lib/utils";

/**
 * SignalDistributionCard — telt hoe vaak elk signaaltype in de top-N
 * voorkomt. Hiermee zie je in één oogopslag of de radar vooral
 * value-dislocaties meldt, defensieve koopjes, of een mix.
 *
 * Pure presentatie — alle getallen komen uit `report.signalDistribution`.
 */

interface Props {
  report: OpportunityReport;
}

export function SignalDistributionCard({ report }: Props) {
  const total = Object.values(report.signalDistribution).reduce(
    (sum, n) => sum + n,
    0,
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
            <BarChart3 className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Signaalverdeling
            </p>
            <p className="text-sm text-foreground">
              Hoe vaak elk signaaltype voorkomt in de {report.candidateCount}{" "}
              getoonde kandidaten.
            </p>
          </div>
        </div>

        {total === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-4 text-sm text-muted-foreground">
            Geen actieve signalen in deze scan.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {OPPORTUNITY_SIGNAL_TYPES.map((type) => (
              <DistributionRow
                key={type}
                type={type}
                count={report.signalDistribution[type]}
                total={total}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DistributionRow({
  type,
  count,
  total,
}: {
  type: OpportunitySignalType;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const tone = SIGNAL_TONE[type];

  return (
    <li className="rounded-md border border-border/60 bg-surface/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground">
          {SIGNAL_LABELS[type]}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            tone === "positive"
              ? "bg-success/70"
              : tone === "warning"
                ? "bg-warning/70"
                : "bg-primary/50",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </li>
  );
}
