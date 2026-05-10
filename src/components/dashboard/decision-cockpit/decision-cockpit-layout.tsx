import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * DecisionCockpitLayout — premium, rustige zakelijke uitstraling.
 *
 * Layout-principes:
 *  - **Above-the-fold-viewport** (eerste schermhoogte) bevat de
 *    Primary Action + Portfolio Status. Scrollt mee met de pagina —
 *    NIET sticky meer. Sticky bleek de onderliggende secties af te
 *    dekken (z-index 20) waardoor risk/opportunity-cards onleesbaar
 *    werden bij scrollen op desktop.
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
  /** Optionele Portfolio Health Score-kaart — naast de status-snapshot
   *  in de above-the-fold zone. */
  health?: ReactNode;
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
  health,
  header,
  className,
}: Props) {
  return (
    <div className={cn("space-y-6", className)}>
      {header}

      {/* Above-the-fold zone: primary action + status.
       *
       * Geen sticky meer — eerdere `lg:sticky lg:top-4 lg:z-20` legde
       * deze zone bovenop onderliggende secties tijdens scrollen, wat
       * cards onleesbaar maakte. Spacing: gap-3 binnen de zone
       * (compact), gap-6 naar de volgende sectie (default `space-y-6`
       * van de wrapper).
       */}
      <section aria-label="Direct besluit" className="space-y-3">
        {primaryAction}
        {health ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <div>{status}</div>
            {health}
          </div>
        ) : (
          status
        )}
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
