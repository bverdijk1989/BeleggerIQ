"use client";

import { useState } from "react";
import { AlertTriangle, Info, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ActionDecisionExplanation } from "@/lib/ai";
import type { PositionAction } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/**
 * Knop op een actie-rij die de AI Decision Explainer aanroept.
 *
 * Geen client-side businesslogica: fetcht `/api/ai/explain` met de
 * volledige `PositionAction` als context, ontvangt een
 * `ActionDecisionExplanation` (die volledig deterministisch uit de
 * engine-output is opgebouwd) en rendert die in een Sheet.
 */

interface Props {
  action: PositionAction;
}

export function ActionExplainerButton({ action }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ActionDecisionExplanation | null>(null);

  async function fetchExplanation(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: { useCase: "action_decision", action },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as ActionDecisionExplanation;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout.");
    } finally {
      setLoading(false);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !data && !loading) void fetchExplanation();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5" />
          Uitleg
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Decision Explainer
          </SheetTitle>
          <SheetDescription>
            Engine-uitkomst toegelicht — AI mag geen cijfers verzinnen.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uitleg samenstellen…
            </p>
          )}
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mr-1 inline h-4 w-4" />
              {error}
            </p>
          )}
          {data && <ExplanationBody data={data} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ExplanationBody({ data }: { data: ActionDecisionExplanation }) {
  return (
    <div className="space-y-4">
      <header className="rounded-md border border-border/60 bg-surface/40 p-3">
        <p className="text-sm text-foreground">{data.headline}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Confidence {(data.confidence * 100).toFixed(0)}% · bronnen:{" "}
          {data.sources.join(", ") || "—"}
        </p>
      </header>

      <Section
        title="Waarom deze actie logisch is"
        items={data.whyLogical}
        tone="info"
      />
      <Section
        title="Risico's van deze actie"
        items={data.risks}
        tone="warn"
      />
      <Section
        title="Wat kan misgaan"
        items={data.whatCanGoWrong}
        tone="bad"
      />

      <p className="flex items-start gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        {data.disclaimer}
      </p>
    </div>
  );
}

function Section({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "info" | "warn" | "bad";
}) {
  if (items.length === 0) return null;
  const dotClass =
    tone === "info"
      ? "bg-primary"
      : tone === "warn"
        ? "bg-warning"
        : "bg-destructive";
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((text, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-foreground">
            <span className={cn("mt-1.5 h-1 w-1 shrink-0 rounded-full", dotClass)} />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
