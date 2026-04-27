"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Sparkles,
  Wand2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  DashboardSummaryConfidence,
  DashboardSummaryExplanation,
} from "@/lib/ai";
import { cn } from "@/lib/utils";

/**
 * AiExplainPanel — onderaan de Decision Cockpit.
 *
 * AI legt **alleen uit** wat de engines al hebben besloten. De
 * dashboard-explainer is een pure deterministische renderer: dezelfde
 * engine-input → dezelfde NL-tekst. Geen LLM-call. (Voor toekomstige
 * LLM-swap is er een prompt-payload + numeric-claim validator
 * beschikbaar via `lib/ai/dashboard-explainer`.)
 *
 * UX:
 *  - Collapsed by default met de headline en een "Leg dit advies uit"-
 *    knop.
 *  - Bij expand: drie korte secties (Waarom deze acties / Onzekerheden /
 *    Wat kan ik aanvullen).
 *  - Confidence-tier kleurt de rand (high/medium/low).
 *  - Disclaimer onderaan: "AI legt alleen uit, geen koop-/verkoopadvies".
 *
 * Pure presentatie — alle inhoud komt uit de prop `explanation`.
 */

interface Props {
  explanation: DashboardSummaryExplanation;
  /** Default closed; pass `defaultOpen={true}` om in beeld te tonen. */
  defaultOpen?: boolean;
}

const TIER_STYLES: Record<
  DashboardSummaryConfidence,
  { container: string; chip: string; icon: string }
> = {
  high: {
    container: "border-emerald-500/30 bg-emerald-500/[0.03]",
    chip: "bg-emerald-500/15 text-emerald-200",
    icon: "bg-emerald-500/15 text-emerald-200",
  },
  medium: {
    container: "border-border/60 bg-surface/40",
    chip: "bg-primary/15 text-primary",
    icon: "bg-primary/15 text-primary",
  },
  low: {
    container: "border-amber-500/30 bg-amber-500/[0.04]",
    chip: "bg-amber-500/15 text-amber-200",
    icon: "bg-amber-500/15 text-amber-200",
  },
};

const TIER_LABEL: Record<DashboardSummaryConfidence, string> = {
  high: "Hoog",
  medium: "Gemiddeld",
  low: "Laag",
};

export function AiExplainPanel({ explanation, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const styles = TIER_STYLES[explanation.confidenceTier];

  return (
    <Card className={cn("border", styles.container)}>
      <CardContent className="space-y-3 p-5">
        <header className="flex items-start gap-3">
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              styles.icon,
            )}
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              AI-uitleg (engine-samenvatting)
            </p>
            <p className="text-sm leading-snug text-foreground">
              {explanation.headline}
            </p>
          </div>
          <span
            className={cn(
              "rounded-md border border-border/40 px-2 py-0.5 text-[10px] font-medium",
              styles.chip,
            )}
          >
            Confidence {TIER_LABEL[explanation.confidenceTier]} ·{" "}
            {(explanation.confidence * 100).toFixed(0)}%
          </span>
        </header>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="ai-explain-content"
          >
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
            {open ? "Verberg uitleg" : "Leg dit advies uit"}
            {open ? (
              <ChevronUp className="ml-1.5 h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
            )}
          </Button>
          {explanation.confidenceTier === "low" && (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-200">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              Lage confidence — engines hebben beperkte data.
            </span>
          )}
        </div>

        {open && (
          <div
            id="ai-explain-content"
            className="space-y-3 border-t border-border/60 pt-3"
          >
            <Section
              title="Waarom deze acties bovenaan staan"
              items={explanation.whyTopActions}
            />
            <Section
              title="Onzekerheden"
              items={explanation.uncertainties}
              tone="warn"
            />
            <Section
              title="Wat kan ik aanvullen?"
              items={explanation.improvementSuggestions}
              tone="info"
            />

            {explanation.sources.length > 0 && (
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Bronnen: {explanation.sources.join(" · ")}
              </p>
            )}

            <p className="flex items-start gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              {explanation.disclaimer}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  items,
  tone = "neutral",
}: {
  title: string;
  items: string[];
  tone?: "neutral" | "warn" | "info";
}) {
  const dotClass =
    tone === "warn"
      ? "bg-amber-300"
      : tone === "info"
        ? "bg-primary"
        : "bg-muted-foreground";
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
            >
              <span
                className={cn(
                  "mt-1.5 h-1 w-1 shrink-0 rounded-full",
                  dotClass,
                )}
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
