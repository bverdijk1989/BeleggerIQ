import { Target } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { OpportunityCandidate } from "@/lib/analytics/opportunity-radar";

import { OpportunityRow } from "./opportunity-row";

/**
 * OpportunityList — hoofdlijst op /kansen. Itereert over de top-N
 * kandidaten en rendert één row per kandidaat. Pure presentatie.
 */

interface Props {
  candidates: OpportunityCandidate[];
}

export function OpportunityList({ candidates }: Props) {
  if (candidates.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-muted-foreground">
            <Target className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Geen kansen boven de drempel
            </h3>
            <p className="max-w-md text-sm text-muted-foreground">
              Op dit moment geen portfolio-, screener- of watchlist-triggers met
              voldoende strength. Check later opnieuw of verlaag de drempel.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {candidates.map((candidate, index) => (
        <OpportunityRow
          key={`${candidate.source}-${candidate.ticker}`}
          candidate={candidate}
          rank={index + 1}
        />
      ))}
    </ul>
  );
}
