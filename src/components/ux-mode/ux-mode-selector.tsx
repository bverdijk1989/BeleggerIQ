"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Compass, Layers, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { setUxModeAction } from "@/lib/ux-mode/actions";
import {
  UX_MODE_DESCRIPTIONS,
  UX_MODE_LABELS,
  UX_MODE_TAGLINES,
  type UxMode,
} from "@/lib/ux-mode/types";
import { cn } from "@/lib/utils";

/**
 * UxModeSelector — radio-card-stijl picker voor de UX-modus.
 *
 * UX:
 *  - 3 grote kaarten naast elkaar (lg) of gestapeld (mobile).
 *  - Geselecteerde kaart krijgt primary-border + check-icoon.
 *  - Server-action call via `useTransition`; geen optimistisch UI maar
 *    revalidatePath in de action zorgt voor snelle update.
 */

interface Props {
  current: UxMode;
}

const ICONS: Record<UxMode, typeof Compass> = {
  BEGINNER: Compass,
  FOCUS: Sparkles,
  EXPERT: Layers,
};

const ALL_MODES: UxMode[] = ["BEGINNER", "FOCUS", "EXPERT"];

export function UxModeSelector({ current }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<UxMode>(current);

  function pick(mode: UxMode) {
    if (mode === selected || pending) return;
    setError(null);
    setSelected(mode);
    startTransition(async () => {
      const result = await setUxModeAction({ mode });
      if (!result.ok) {
        setError(result.error ?? "Onbekende fout");
        setSelected(current);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {ALL_MODES.map((mode) => {
          const isActive = selected === mode;
          const Icon = ICONS[mode];
          return (
            <button
              key={mode}
              type="button"
              onClick={() => pick(mode)}
              disabled={pending}
              className={cn(
                "group flex flex-col items-start gap-2 rounded-md border p-4 text-left transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isActive
                  ? "border-primary/60 bg-primary/5 shadow-premium"
                  : "border-border/40 bg-surface/40 hover:border-primary/30",
                pending && "opacity-60",
              )}
              aria-pressed={isActive}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                  <p className="text-sm font-semibold text-foreground">
                    {UX_MODE_LABELS[mode]}
                  </p>
                </div>
                {isActive && (
                  <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
                )}
              </div>
              <Badge variant="outline" className="text-[10px]">
                {UX_MODE_TAGLINES[mode]}
              </Badge>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {UX_MODE_DESCRIPTIONS[mode]}
              </p>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
      {!error && current !== selected && (
        <p className="text-xs text-muted-foreground">Wijziging verwerken…</p>
      )}
    </div>
  );
}
