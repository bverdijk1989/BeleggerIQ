import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RiskFlag, RiskSeverity } from "@/types/risk";

import {
  SEVERITY_LABEL_NL,
  TONE_BG,
  TONE_DOT,
  toneForSeverity,
} from "../severity";

interface TopRiskFlagsProps {
  flags: RiskFlag[];
  limit?: number;
}

/**
 * Overzicht van de belangrijkste risk-flags, aflopend op severity.
 * Houdt tone kalm: alleen "high"/"critical" krijgen een kleurige badge.
 */
export function TopRiskFlags({ flags, limit = 5 }: TopRiskFlagsProps) {
  const sorted = flags
    .slice()
    .sort(
      (a, b) => severityOrder(b.severity) - severityOrder(a.severity),
    )
    .slice(0, limit);

  return (
    <Card className="h-full">
      <CardContent className="space-y-4 p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Top risico&apos;s
          </p>
          <p className="text-sm text-muted-foreground">
            Signalen uit de risk engine, op volgorde van ernst.
          </p>
        </div>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen opvallende risico&apos;s — je portefeuille zit rustig verdeeld.
          </p>
        ) : (
          <ul className="space-y-3">
            {sorted.map((flag) => (
              <FlagRow key={flag.code} flag={flag} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FlagRow({ flag }: { flag: RiskFlag }) {
  const tone = toneForSeverity(flag.severity);
  return (
    <li className="flex items-start gap-3 rounded-md border border-border/60 bg-surface/60 p-3">
      <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{flag.label}</p>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              TONE_BG[tone],
            )}
          >
            {SEVERITY_LABEL_NL[flag.severity]}
          </span>
        </div>
        {flag.message && (
          <p className="mt-1 text-xs text-muted-foreground">{flag.message}</p>
        )}
      </div>
    </li>
  );
}

function severityOrder(severity: RiskSeverity): number {
  const order: Record<RiskSeverity, number> = {
    low: 0,
    moderate: 2,
    elevated: 3,
    high: 4,
    critical: 5,
  };
  return order[severity];
}
