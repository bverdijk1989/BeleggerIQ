import type { Route } from "next";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import type { UxMode } from "@/lib/ux-mode";

/**
 * ModeHintBanner — subtiele uitnodiging om naar een rijkere UX-modus te
 * schakelen.
 *
 * Verschijnt alleen in BEGINNER en FOCUS (niet in EXPERT — daar zijn we
 * al maximaal). Doel:
 *  - BEGINNER → hint naar FOCUS ("zie ook de dagelijkse briefing")
 *  - FOCUS    → hint naar EXPERT ("zie ook factor-breakdowns")
 *
 * Niet-betuttelend: één korte zin + link naar /profiel waar de switch
 * staat. Geen pop-up, geen dwingende CTA — Buffett-laag: eenvoud,
 * gebruiker beslist.
 *
 * **UX-eis Module 4**: "Upgrade-CTA's subtiel verwerken bij premium
 * features." Deze banner zit op het dashboard, niet op detailpages,
 * zodat 'em laagfrequent gezien wordt en niet irriteert.
 */
interface Props {
  mode: UxMode;
}

/**
 * Per modus de hint-config. `null` betekent: geen banner tonen.
 *  - BEGINNER: heeft al eigen educatieve microcopy-banner met
 *    mode-switch-link → geen dubbele banner.
 *  - FOCUS: hint naar EXPERT voor factor/macro/backtest-detail.
 *  - EXPERT: maximaal niveau, geen hogere modus.
 */
const HINTS: Record<UxMode, { nextMode: string; copy: string } | null> = {
  BEGINNER: null,
  FOCUS: {
    nextMode: "Expert",
    copy:
      "Wil je dieper inzicht: factor-breakdowns, macro-regime en backtesting?",
  },
  EXPERT: null,
};

export function ModeHintBanner({ mode }: Props) {
  const hint = HINTS[mode];
  if (!hint) return null;

  return (
    <div
      role="region"
      aria-label={`Hint: schakel naar ${hint.nextMode}-mode`}
      className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <p className="flex-1 text-foreground">
          <span className="text-muted-foreground">{hint.copy}</span>{" "}
          <Link
            href={"/profiel" as Route}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Schakel naar {hint.nextMode}-mode
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
        </p>
      </div>
    </div>
  );
}
