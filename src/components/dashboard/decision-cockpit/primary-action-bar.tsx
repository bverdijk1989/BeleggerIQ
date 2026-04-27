import { CheckCircle2, Zap } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardAction } from "@/lib/analytics";
import type { Currency } from "@/types/common";

import { ActionCard } from "./action-card";

/**
 * PrimaryActionBar — dominante actie-bar bovenaan het dashboard.
 *
 * Toont **maximaal 3** door `buildDashboardPrimaryActions` bepaalde
 * acties (RISK_REDUCTION / BUY_OPPORTUNITY / HOLD_CASH / DO_NOTHING).
 *
 * Pure presentatie. Geen rekenwerk. Geen sortering. Geen filters.
 * Alle businesslogica zit in `@/lib/analytics/actions/dashboard-actions`.
 *
 * UX:
 *  - Dominante header met "Wat moet je nu doen?"-claim.
 *  - Grid: 3 cards naast elkaar op desktop, stacked op mobile.
 *  - Empty-state ("Geen directe actie nodig") met rustige tone als
 *    `actions` leeg is (caller kan ook altijd minstens DO_NOTHING
 *    leveren — dan rendert die als één card).
 */

interface Props {
  actions: DashboardAction[];
  baseCurrency: Currency;
}

export function PrimaryActionBar({ actions, baseCurrency }: Props) {
  if (actions.length === 0) {
    return <EmptyState />;
  }

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
      </CardContent>
    </Card>
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
          Wat moet je NU doen?
        </p>
        <p className="text-sm text-foreground">
          {count === 1
            ? "Eén concrete actie uit de engines."
            : `${count} concrete acties (max 3) uit risk-, rebalance-, action- en allocation-engines.`}
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
            Wat moet je NU doen?
          </p>
          <p className="text-sm text-foreground">
            Geen directe actie nodig — engines geven geen sterke trigger op
            dit moment.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            De cockpit blijft monitoren bij iedere refresh.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
