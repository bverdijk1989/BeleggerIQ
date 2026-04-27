import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * DecisionCockpitLayout — premium, rustige zakelijke uitstraling.
 *
 * Layout-principes:
 *  - **Above-the-fold-viewport** (eerste schermhoogte) bevat de
 *    Primary Action + Portfolio Status. Op desktop ≥ 1024px is dit
 *    een sticky-feel zonder dat het echt sticky is.
 *  - Onder de viewport: 2-koloms risk/opportunities + allocation/scenario.
 *  - Mobile-first: alle kolommen stapelen onder 768px.
 *  - Spacing-ritme: `gap-4` (16px) tussen secties; `gap-6` (24px)
 *    tussen layout-blokken.
 */

interface Props {
  primaryAction: ReactNode;
  status: ReactNode;
  risks: ReactNode;
  opportunities: ReactNode;
  allocation: ReactNode;
  scenario: ReactNode;
  aiExplain: ReactNode;
  /** Sticky header (PageHeader of equivalent). */
  header?: ReactNode;
  className?: string;
}

export function DecisionCockpitLayout({
  primaryAction,
  status,
  risks,
  opportunities,
  allocation,
  scenario,
  aiExplain,
  header,
  className,
}: Props) {
  return (
    <div className={cn("space-y-6", className)}>
      {header}

      {/* Above-the-fold zone: primary action + status.
       *
       * Sticky op desktop ≥ 1024px zodat de primary-action zichtbaar
       * blijft tijdens scrollen. Mobile: sticky uit. Spacing: gap-3
       * binnen de zone (compact), gap-6 naar de volgende sectie
       * (visueel onderscheid tussen "wat doe ik nu" en "context").
       */}
      <section
        aria-label="Direct besluit"
        className={cn(
          "space-y-3",
          "lg:sticky lg:top-4 lg:z-20",
          "lg:rounded-xl lg:border lg:border-border/40 lg:bg-background/95 lg:p-3 lg:shadow-sm lg:backdrop-blur",
        )}
      >
        {primaryAction}
        {status}
      </section>

      {/* Risico's links / kansen rechts — gelijke prioriteit, gelijke
       *  visuele weight. Op mobile stapelt de stack. */}
      <section
        aria-label="Risico's en kansen"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        {risks}
        {opportunities}
      </section>

      {/* Allocatie-impact + scenario-snapshot — secundair, dus iets
       *  smaller scenario-kolom (22rem). */}
      <section
        aria-label="Allocatie- en scenario-preview"
        className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
      >
        {allocation}
        {scenario}
      </section>

      {/* AI explain — onderaan met visuele scheiding van de besluit-rij.
       *  Subtiele border-top zodat de gebruiker ziet dat dit een aparte
       *  uitlegzone is. */}
      <section
        aria-label="AI-uitleg"
        className="border-t border-border/40 pt-4"
      >
        {aiExplain}
      </section>
    </div>
  );
}
