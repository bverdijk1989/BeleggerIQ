"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Bell, BellOff, CheckCircle2, Clock } from "lucide-react";

import {
  TONE_STYLES,
  type CockpitTone,
} from "@/components/dashboard/decision-cockpit/tone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  resetBehavioralWarningAction,
  updateBehavioralWarningStateAction,
} from "@/lib/analytics/behavioral/actions";
import type {
  BehavioralSeverity,
  BehavioralSignalWithState,
} from "@/lib/analytics/behavioral";
import { cn } from "@/lib/utils";

/**
 * WarningCard — één behavioral signal als kaart.
 *
 * Toon: coachend, niet betuttelend. Layout:
 *  - Severity-badge + titel
 *  - Coachende uitleg (1–3 zinnen)
 *  - Reflectievragen (collapsible)
 *  - Acties: "Negeer", "Snooze 7d", of (bij DISMISSED/SNOOZED) "Activeer"
 *
 * Server-actions worden via `useTransition` aangeroepen — geen client-side
 * fetch, geen revalidate-glue nodig (de action doet `revalidatePath`).
 */

interface Props {
  signal: BehavioralSignalWithState;
  /** Verbergt actie-knoppen wanneer in compact-modus (dashboard widget). */
  compact?: boolean;
}

const SEVERITY_TONE: Record<BehavioralSeverity, CockpitTone> = {
  low: "neutral",
  moderate: "warning",
  elevated: "warning",
  high: "critical",
};

const SEVERITY_LABEL: Record<BehavioralSeverity, string> = {
  low: "Aandachtspunt",
  moderate: "Aandachtspunt",
  elevated: "Stevig signaal",
  high: "Sterk signaal",
};

export function WarningCard({ signal, compact = false }: Props) {
  const [showReflection, setShowReflection] = useState(false);
  const [isPending, startTransition] = useTransition();
  const tone = SEVERITY_TONE[signal.severity];
  const styles = TONE_STYLES[tone];

  const status = signal.effectiveStatus;
  const isActive = status === "ACTIVE";

  function dismiss() {
    startTransition(async () => {
      await updateBehavioralWarningStateAction({
        signalId: signal.id,
        status: "DISMISSED",
      });
    });
  }

  function snooze7d() {
    startTransition(async () => {
      const dt = new Date();
      dt.setUTCDate(dt.getUTCDate() + 7);
      await updateBehavioralWarningStateAction({
        signalId: signal.id,
        status: "SNOOZED",
        snoozedUntil: dt.toISOString(),
      });
    });
  }

  function reactivate() {
    startTransition(async () => {
      await resetBehavioralWarningAction({ signalId: signal.id });
    });
  }

  return (
    <div
      className={cn(
        "rounded-md border p-4 transition-colors",
        styles.container,
        status !== "ACTIVE" && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle
              className={cn("h-4 w-4 shrink-0", styles.iconFg)}
              aria-hidden
            />
            <h4 className="text-sm font-semibold text-foreground">
              {signal.title}
            </h4>
            <Badge variant="outline" className={cn("text-[10px]", styles.chip)}>
              {SEVERITY_LABEL[signal.severity]}
            </Badge>
            {status === "DISMISSED" && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <BellOff className="h-2.5 w-2.5" aria-hidden />
                Genegeerd
              </Badge>
            )}
            {status === "SNOOZED" && signal.state?.snoozedUntil && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Clock className="h-2.5 w-2.5" aria-hidden />
                Snooze tot{" "}
                {new Date(signal.state.snoozedUntil).toLocaleDateString("nl-NL", {
                  day: "2-digit",
                  month: "2-digit",
                })}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {signal.message}
          </p>
          {signal.nextStep && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Volgende stap:</span>{" "}
              {signal.nextStep}
            </p>
          )}
        </div>
      </div>

      {!compact && signal.reflectionQuestions.length > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowReflection((v) => !v)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {showReflection ? "Verberg reflectievragen" : "Toon reflectievragen"}
          </button>
          {showReflection && (
            <ul className="mt-2 space-y-2">
              {signal.reflectionQuestions.map((q) => (
                <li
                  key={q.key}
                  className="rounded border border-border/40 bg-background/40 p-2 text-xs"
                >
                  <p className="text-foreground">{q.question}</p>
                  {q.hint && (
                    <p className="mt-1 italic text-muted-foreground">
                      {q.hint}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!compact && (
        <div className="mt-3 flex flex-wrap gap-2">
          {isActive ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={snooze7d}
              >
                <Clock className="mr-1 h-3 w-3" aria-hidden />
                Snooze 7 dagen
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={dismiss}
              >
                <BellOff className="mr-1 h-3 w-3" aria-hidden />
                Negeer
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={reactivate}
            >
              <Bell className="mr-1 h-3 w-3" aria-hidden />
              Activeer opnieuw
            </Button>
          )}
        </div>
      )}

      {!compact && (
        <p className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
          <CheckCircle2 className="h-2.5 w-2.5" />
          Signaalbron: {signal.sourceEngines.join(" · ")}
        </p>
      )}
    </div>
  );
}
