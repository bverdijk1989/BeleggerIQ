import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Newspaper, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  BriefingConfidence,
  DailyBriefing,
} from "@/lib/ai/briefing";
import { cn } from "@/lib/utils";

import { TONE_STYLES, type CockpitTone } from "./tone";

/**
 * BriefingCard — compacte widget op het dashboard die de daily-briefing
 * samenvat. UX-doel: gebruiker leest binnen 5 seconden de headline + de
 * één concrete focus-actie. Volledige 7-secties op `/briefing`.
 *
 * Geen client-side AI-call: de page renderert deze server-side, waar
 * de cache en provider-fallback al hun werk hebben gedaan.
 */

interface Props {
  briefing: DailyBriefing;
  detailHref?: Route;
}

const CONFIDENCE_TONE: Record<BriefingConfidence, CockpitTone> = {
  high: "good",
  medium: "neutral",
  low: "warning",
};

const CONFIDENCE_LABEL: Record<BriefingConfidence, string> = {
  high: "Hoge data-dekking",
  medium: "Gemiddelde data-dekking",
  low: "Beperkte data-dekking",
};

export function BriefingCard({
  briefing,
  detailHref = "/briefing" as Route,
}: Props) {
  const tone = CONFIDENCE_TONE[briefing.confidenceTier];
  const styles = TONE_STYLES[tone];
  const isAi = briefing.mode === "ai";

  return (
    <Card className={cn("border", styles.container)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Newspaper className={cn("h-4 w-4", styles.iconFg)} aria-hidden />
            Dagelijkse briefing
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {isAi && (
              <Badge
                variant="outline"
                className="gap-1 text-[10px]"
                title={`Gegenereerd via ${briefing.providerId}/${briefing.model}`}
              >
                <Sparkles className="h-2.5 w-2.5" aria-hidden />
                AI
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn("text-[10px]", styles.chip)}
            >
              {CONFIDENCE_LABEL[briefing.confidenceTier]}
            </Badge>
          </div>
        </div>
        <CardDescription className="text-xs">{briefing.headline}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-md border border-border/40 bg-muted/20 p-3 text-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Focuspunt vandaag
          </p>
          <p className="mt-1 text-foreground">{briefing.focusAction}</p>
        </div>

        {briefing.dataLimitations.length > 0 && (
          <p className="text-[10px] italic text-muted-foreground">
            {briefing.dataLimitations[0]}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[10px] text-muted-foreground">
            Bronnen: {briefing.sources.slice(0, 3).join(" · ")}
            {briefing.sources.length > 3 ? "…" : ""}
          </p>
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Volledige briefing
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
