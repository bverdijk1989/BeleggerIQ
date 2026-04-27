import { Card, CardContent } from "@/components/ui/card";
import type { PortfolioStatusSnapshot as StatusSnapshotVM } from "@/lib/analytics";

import { StatusMetricCard } from "./status-metric-card";

/**
 * PortfolioStatusSnapshot — compacte 5-kaart statusrij onder de
 * Primary Action Bar. Pure presentatie; alle 5 cards komen kant-en-
 * klaar uit `buildPortfolioStatusSnapshot`.
 *
 * Layout:
 *   - Mobile: 2 kolommen (laatste card vult full-width).
 *   - Tablet ≥ 640px: 3 kolommen.
 *   - Desktop ≥ 1024px: 5 kolommen op één rij.
 *
 * Bewust geen grote grafieken hier — compactness en scanbaarheid eerst.
 */

interface Props {
  snapshot: StatusSnapshotVM;
}

export function PortfolioStatusSnapshot({ snapshot }: Props) {
  return (
    <Card>
      <CardContent className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-5">
        {snapshot.cards.map((card) => (
          <StatusMetricCard key={card.id} metric={card} />
        ))}
      </CardContent>
    </Card>
  );
}
