import { AlertTriangle, CheckCircle2, CircleDashed, Sparkles } from "lucide-react";

import {
  TONE_STYLES,
  type CockpitTone,
} from "@/components/dashboard/decision-cockpit/tone";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  ConfidenceTier,
  InvestmentConfidenceScore,
  SignalContribution,
  SignalDataQuality,
} from "@/lib/analytics/signal-fusion/types";
import { cn } from "@/lib/utils";

/**
 * ConfidenceScorecard — toont de Investment Confidence Score per
 * instrument, met volledige breakdown van de 10 signalen.
 *
 * **Geen black box**: elke component is zichtbaar, met score, gewicht,
 * bijdrage, rationale en data-quality-pill. Bij lage data-dekking een
 * expliciete waarschuwing bovenaan.
 */

interface Props {
  result: InvestmentConfidenceScore;
}

const TIER_TONE: Record<ConfidenceTier, CockpitTone> = {
  STRONG: "good",
  POSITIVE: "good",
  NEUTRAL: "neutral",
  WEAK: "warning",
  AVOID: "critical",
};

const TIER_LABEL: Record<ConfidenceTier, string> = {
  STRONG: "Sterk",
  POSITIVE: "Positief",
  NEUTRAL: "Neutraal",
  WEAK: "Zwak",
  AVOID: "Onzeker",
};

const DATA_QUALITY_LABEL: Record<SignalDataQuality, string> = {
  high: "Hoog",
  medium: "Medium",
  low: "Laag",
  missing: "Geen data",
};

const DATA_QUALITY_TONE: Record<SignalDataQuality, string> = {
  high: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  medium: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  low: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  missing: "border-border/40 bg-muted/20 text-muted-foreground",
};

export function ConfidenceScorecard({ result }: Props) {
  const tone = TIER_TONE[result.tier];
  const styles = TONE_STYLES[tone];

  return (
    <Card className={cn("border", styles.container)}>
      <CardHeader className="space-y-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className={cn("h-4 w-4", styles.iconFg)} aria-hidden />
            Investment Confidence
          </CardTitle>
          <Badge variant="outline" className={cn("font-mono", styles.chip)}>
            {TIER_LABEL[result.tier]} · {result.totalScore}/100
          </Badge>
        </div>
        <CardDescription className="text-xs">{result.headline}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Score-balk */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className={cn("h-full transition-all", styles.iconBg)}
            style={{
              width: `${Math.max(2, Math.min(100, result.totalScore))}%`,
            }}
          />
        </div>

        {/* Effective weight + data-quality */}
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span>
            Bruikbaar gewicht: {Math.round(result.effectiveWeight * 100)}%
          </span>
          <Badge
            variant="outline"
            className={cn("text-[10px]", DATA_QUALITY_TONE[result.dataQuality])}
          >
            Data: {DATA_QUALITY_LABEL[result.dataQuality]}
          </Badge>
        </div>

        {/* Warning bij lage data-dekking */}
        {result.warning && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-200">
            <AlertTriangle
              className="mt-0.5 h-3 w-3 shrink-0"
              aria-hidden
            />
            <p>{result.warning}</p>
          </div>
        )}

        {/* Signaal-breakdown */}
        <div className="space-y-1.5">
          {result.signals.map((signal) => (
            <SignalRow key={signal.key} signal={signal} />
          ))}
        </div>

        {/* Beperkingen */}
        {result.dataLimitations.length > 0 && (
          <div className="rounded-md border border-border/40 bg-muted/10 p-2 text-[10px] text-muted-foreground">
            <p className="font-semibold uppercase tracking-wider text-foreground">
              Datalimitaties
            </p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              {result.dataLimitations.map((lim, i) => (
                <li key={i}>{lim}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SignalRow({ signal }: { signal: SignalContribution }) {
  const isMissing = signal.score === null;
  const Icon =
    signal.dataQuality === "missing"
      ? CircleDashed
      : signal.dataQuality === "low"
        ? AlertTriangle
        : CheckCircle2;

  return (
    <div className="rounded-md border border-border/40 bg-surface/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon
            className={cn(
              "h-3 w-3",
              isMissing
                ? "text-muted-foreground"
                : signal.dataQuality === "low"
                  ? "text-amber-400"
                  : "text-emerald-400",
            )}
            aria-hidden
          />
          <span className="text-xs font-medium text-foreground">
            {signal.label}
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-muted-foreground">
            gewicht {Math.round(signal.weight * 100)}%
          </span>
          <span
            className={cn(
              "font-bold tabular-nums",
              isMissing ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {isMissing ? "—" : `${Math.round(signal.score!)}/100`}
          </span>
        </div>
      </div>

      {!isMissing && signal.score !== null && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className={cn(
              "h-full",
              signal.score >= 65
                ? "bg-emerald-400"
                : signal.score <= 35
                  ? "bg-amber-400"
                  : "bg-blue-400",
            )}
            style={{
              width: `${Math.max(2, Math.min(100, signal.score))}%`,
            }}
          />
        </div>
      )}

      <p className="mt-1.5 text-[10px] text-muted-foreground">
        {signal.rationale}
      </p>
      <p className="mt-0.5 text-[9px] text-muted-foreground">
        Bron: {signal.source}
        {signal.contribution !== null && (
          <> · Bijdrage: {signal.contribution.toFixed(1)} punten</>
        )}
      </p>
    </div>
  );
}
