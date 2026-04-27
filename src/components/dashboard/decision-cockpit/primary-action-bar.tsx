import { CheckCircle2, Clock, Zap } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardAction } from "@/lib/analytics";
import type { Currency } from "@/types/common";

import { ActionCard } from "./action-card";

/**
 * PrimaryActionBar — actie-bar bovenaan het dashboard.
 *
 * Toont **maximaal 3** door `buildDashboardPrimaryActions` bepaalde
 * acties (RISK_REDUCTION / BUY_OPPORTUNITY / HOLD_CASH / DO_NOTHING).
 *
 * Pure presentatie. Geen rekenwerk. Geen sortering. Geen filters.
 * Alle businesslogica zit in `@/lib/analytics/actions/dashboard-actions`.
 *
 * UX (Kahneman / Thaler):
 *  - Header is **reflectief**, niet imperatief — "Aandachtspunten" in
 *    plaats van "Wat moet je NU doen?". Voorkomt action-bias.
 *  - **Niets-doen-nudge** onder elke actiegerichte rij: "Niets doen
 *    vandaag is altijd een geldige optie." Thaler-style nudge richting
 *    geduld; minimaliseert FOMO en panic-selling.
 *  - Grid: 3 cards naast elkaar op desktop, stacked op mobile.
 *  - Empty-state met rustige tone als `actions` leeg is.
 */

interface Props {
  actions: DashboardAction[];
  baseCurrency: Currency;
}

export function PrimaryActionBar({ actions, baseCurrency }: Props) {
  if (actions.length === 0) {
    return <EmptyState />;
  }

  // Heeft minimaal één actie die echte transactie vraagt? Dan tonen we
  // de Thaler-style "niets doen is OK"-nudge onder de cards.
  const hasTransactionAction = actions.some(
    (a) => a.type === "RISK_REDUCTION" || a.type === "BUY_OPPORTUNITY",
  );

  return (
    <Card className="border-border/60">
      <CardContent className="space-y-4 p-5">
        <Header count={actions.length} />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {actions.map((action, i) => (
            <ActionCard
              key={action.id}
              action={action}
              baseCurrency={baseCurrency}
              rankLabel={`#${i + 1}/${actions.length}`}
            />
          ))}
        </div>
        {hasTransactionAction && <DoNothingNudge />}
      </CardContent>
    </Card>
  );
}

function DoNothingNudge() {
  return (
    <p className="flex items-start gap-2 rounded-md border border-dashed border-border/60 bg-surface/30 p-2 text-[11px] text-muted-foreground">
      <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <span>
        Niets doen vandaag is altijd een geldige optie. Adviezen blijven
        14 dagen geldig — neem de tijd om te beslissen, of slaap er
        een nacht over voor je een grote actie uitvoert.
      </span>
    </p>
  );
}

// ============================================================
//  Header
// ============================================================

function Header({ count }: { count: number }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-primary">
        <Zap className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Aandachtspunten vandaag
        </p>
        <p className="text-sm text-foreground">
          {count === 1
            ? "Eén punt om te overwegen — geen verplichting om vandaag te handelen."
            : `${count} punten om te overwegen (max 3). Geen verplichting om vandaag te handelen.`}
        </p>
      </div>
    </div>
  );
}

// ============================================================
//  Empty state
// ============================================================

function EmptyState() {
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-start gap-3 p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-success/15 text-success">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Aandachtspunten vandaag
          </p>
          <p className="text-sm text-foreground">
            Geen punten om vandaag te overwegen — engines zien geen sterke
            triggers. Een rustige dag in je portefeuille.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            De cockpit kijkt automatisch mee bij iedere refresh.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
