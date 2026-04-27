import { Info, Tornado } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { DashboardScenarioSnapshot } from "@/lib/analytics";
import type { Currency } from "@/types/common";

import { ScenarioImpactCard } from "./scenario-impact-card";

/**
 * ScenarioSnapshot — compact "Wat als…"-blok op het dashboard.
 *
 * Toont maximaal 4 scenario-kaarten (rente +2%, markt -20%, USD ±10%,
 * defensief regime verslechtert). Elke kaart heeft impact in % + €,
 * top-3 drivers en een concrete voorbereidende actie.
 *
 * Pure presentatie. Alle waarden komen uit `buildScenarioSnapshot`.
 * Bij `hasIndicativeCards=true` toont een banner dat de cijfers
 * indicatief zijn — geen voorspelling.
 */

interface Props {
  snapshot: DashboardScenarioSnapshot;
  baseCurrency: Currency;
}

export function ScenarioSnapshot({ snapshot, baseCurrency }: Props) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <header className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/15 text-warning">
              <Tornado className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Scenario-impact
              </p>
              <p className="text-sm text-foreground">
                Indicatieve gevoeligheid bij macro-shocks. Geen voorspelling.
              </p>
            </div>
          </div>
        </header>

        {snapshot.cards.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-surface/40 p-3 text-xs text-muted-foreground">
            Geen scenario-data beschikbaar — controleer of macro-engine
            heeft kunnen draaien.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {snapshot.cards.map((card) => (
              <ScenarioImpactCard
                key={card.id}
                card={card}
                baseCurrency={baseCurrency}
              />
            ))}
          </div>
        )}

        {snapshot.hasIndicativeCards && (
          <p className="flex items-start gap-1 border-t border-border/40 pt-2 text-[10px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            <span>
              Sommige scenario&apos;s zijn indicatief: de macro-engine
              heeft beperkte data voor deze portefeuille. Vul fundamentals
              of sector-mapping aan voor scherpere cijfers.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
