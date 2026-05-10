import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Compass, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TONE_STYLES,
  type CockpitTone,
} from "@/components/dashboard/decision-cockpit/tone";
import type {
  BehavioralReport,
  BehavioralSignalWithState,
} from "@/lib/analytics/behavioral";
import { cn } from "@/lib/utils";

import { WarningCard } from "./warning-card";

/**
 * CoachCard — compacte dashboard-widget voor de Behavioral Coach.
 *
 * Toont **alleen ACTIVE signalen**; dismissed/snoozed staan op /coach.
 * Bij 0 ACTIVE signalen krijgt de gebruiker een rustige bevestiging
 * ("geen patronen gedetecteerd"), niet een lege state.
 *
 * Pure presentatie — alle interactie zit in `WarningCard` (client).
 */

interface Props {
  report: BehavioralReport;
  signals: BehavioralSignalWithState[];
  detailHref?: Route;
  /** Maximaal te tonen signalen (default 2 — dashboard blijft compact). */
  limit?: number;
}

const COUNT_TONE: Record<"high" | "elevated" | "moderate" | "low", CockpitTone> = {
  high: "critical",
  elevated: "warning",
  moderate: "warning",
  low: "neutral",
};

export function CoachCard({
  report,
  signals,
  detailHref = "/coach" as Route,
  limit = 2,
}: Props) {
  const active = signals.filter((s) => s.effectiveStatus === "ACTIVE");
  const totalActive = active.length;
  const top = active.slice(0, limit);

  const dominantTier =
    report.counts.high > 0
      ? "high"
      : report.counts.elevated > 0
        ? "elevated"
        : report.counts.moderate > 0
          ? "moderate"
          : "low";
  const tone = COUNT_TONE[dominantTier];
  const styles = TONE_STYLES[tone];

  return (
    <Card className={cn("border", styles.container)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Compass className={cn("h-4 w-4", styles.iconFg)} aria-hidden />
            Behavioral Coach
          </CardTitle>
          <Badge variant="outline" className={cn("text-[10px]", styles.chip)}>
            {totalActive} actief
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {totalActive === 0
            ? "Geen actieve gedragspatronen — je strategie en je portefeuille lopen synchroon."
            : "Een paar reflectiepunten — coachend, niet veroordelend."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {totalActive === 0 ? (
          <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-primary" aria-hidden />
              Je portefeuille toont op dit moment geen patronen die om
              reflectie vragen. Blijf bewust handelen.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {top.map((s) => (
              <WarningCard key={s.id} signal={s} compact />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[10px] text-muted-foreground">
            {report.counts.high > 0 && `${report.counts.high} sterk · `}
            {report.counts.elevated > 0 && `${report.counts.elevated} stevig · `}
            {report.counts.moderate > 0 && `${report.counts.moderate} aandacht`}
            {report.counts.high === 0 &&
              report.counts.elevated === 0 &&
              report.counts.moderate === 0 &&
              "Geen openstaande patronen"}
          </p>
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Volledig overzicht
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
