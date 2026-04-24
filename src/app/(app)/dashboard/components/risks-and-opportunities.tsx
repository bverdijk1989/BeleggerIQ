import Link from "next/link";
import { ArrowRight, Sparkles, TriangleAlert } from "lucide-react";

import { ScorePill } from "@/components/common/score-pill";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ScreenerCandidate } from "@/lib/analytics/screener";
import { cn } from "@/lib/utils";
import type {
  PortfolioRiskSummary,
  RiskFlag,
  RiskSeverity,
} from "@/types/risk";

/**
 * Twee compacte cards voor op het dashboard: top-3 risks en top-3 koopkansen.
 * Beide leiden met een CTA-link naar de volledige pagina's.
 */

export function TopRisksCard({
  risk,
  limit = 3,
}: {
  risk: PortfolioRiskSummary;
  limit?: number;
}) {
  const top = risk.flags
    .slice()
    .sort((a, b) => severityOrder(b.severity) - severityOrder(a.severity))
    .slice(0, limit);

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
              <TriangleAlert className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Top risico&apos;s
              </p>
              <p className="text-sm text-foreground">
                De drie belangrijkste signalen uit de risk-engine.
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/risico">
              Meer <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen opvallende risico&apos;s — portefeuille zit rustig verdeeld.
          </p>
        ) : (
          <ul className="space-y-2">
            {top.map((flag) => (
              <RiskRow key={flag.code} flag={flag} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RiskRow({ flag }: { flag: RiskFlag }) {
  const tone = severityTone(flag.severity);
  return (
    <li className="flex items-start gap-3 rounded-md border border-border/60 bg-surface/60 p-3">
      <span
        className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", tone.dotClass)}
      />
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{flag.label}</p>
        {flag.message && (
          <p className="mt-1 text-xs text-muted-foreground">{flag.message}</p>
        )}
      </div>
    </li>
  );
}

// ============================================================
//  Opportunities
// ============================================================

export function TopOpportunitiesCard({
  candidates,
  limit = 3,
}: {
  candidates: ScreenerCandidate[];
  limit?: number;
}) {
  const top = candidates.slice(0, limit);

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Top koopkansen
              </p>
              <p className="text-sm text-foreground">
                Hoogste factor composite in het universe.
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/screener">
              Screener <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen kandidaten — controleer je filters op de screener.
          </p>
        ) : (
          <ul className="space-y-2">
            {top.map((candidate, i) => (
              <OpportunityRow
                key={candidate.ticker}
                candidate={candidate}
                rank={i + 1}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function OpportunityRow({
  candidate,
  rank,
}: {
  candidate: ScreenerCandidate;
  rank: number;
}) {
  const strength = candidate.strengths[0];
  return (
    <li className="flex items-start gap-3 rounded-md border border-border/60 bg-surface/60 p-3">
      <span className="mt-0.5 rounded-sm bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
        #{rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {candidate.name}
          </p>
          <ScorePill
            score={candidate.factorScore.composite}
            label="Composite"
          />
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
          {candidate.ticker} · {candidate.sector}
        </p>
        {strength && (
          <p className="mt-1 text-xs text-muted-foreground">{strength}</p>
        )}
      </div>
    </li>
  );
}

// ============================================================
//  Shared helpers
// ============================================================

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

function severityTone(severity: RiskSeverity): { dotClass: string } {
  switch (severity) {
    case "critical":
    case "high":
      return { dotClass: "bg-destructive" };
    case "elevated":
    case "moderate":
      return { dotClass: "bg-warning" };
    case "low":
    default:
      return { dotClass: "bg-muted-foreground/60" };
  }
}
