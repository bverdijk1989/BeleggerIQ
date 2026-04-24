import { Database } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { OpportunityReport } from "@/lib/analytics/opportunity-radar";

/**
 * SourcesScannedCard — audit-trail over welke bronnen de scan heeft
 * geraadpleegd. Puur presentationeel.
 */
interface Props {
  report: OpportunityReport;
}

export function SourcesScannedCard({ report }: Props) {
  const { portfolioHoldings, screenerCandidates, watchlistItems } =
    report.sourcesScanned;
  const scanned = new Date(report.scannedAt).toLocaleString("nl-NL");

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-elevated text-muted-foreground">
            <Database className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Bronnen gescand
            </p>
            <p className="text-sm text-foreground">
              Audit-trail van deze scan — transparant welke pools zijn bekeken.
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-3">
          <Row label="Portefeuille" value={portfolioHoldings} />
          <Row label="Screener" value={screenerCandidates} />
          <Row label="Watchlist" value={watchlistItems} />
        </dl>

        <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
          Scan uitgevoerd op {scanned}.
        </p>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/60 p-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
        {value}
      </dd>
    </div>
  );
}
