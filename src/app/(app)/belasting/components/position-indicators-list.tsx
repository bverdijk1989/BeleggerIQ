import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IndicatorResult, IndicatorTag } from "@/lib/tax/position-indicators";
import { cn } from "@/lib/utils";

const TAG_LABELS: Record<IndicatorTag, string> = {
  "us-dividend": "US-bron",
  "reit-warning": "REIT",
  "accumulating-etf": "Accumulerend",
  "no-direct-cashflow": "Geen cash-dividend",
};

const TAG_TONES: Record<IndicatorTag, string> = {
  "us-dividend": "border-primary/40 bg-primary/10 text-primary",
  "reit-warning": "border-warning/40 bg-warning/10 text-warning",
  "accumulating-etf": "border-muted-foreground/40 bg-surface text-foreground",
  "no-direct-cashflow": "border-muted-foreground/40 bg-surface text-muted-foreground",
};

interface PositionIndicatorsListProps {
  positions: Array<IndicatorResult & { name?: string | null }>;
}

export function PositionIndicatorsList({
  positions,
}: PositionIndicatorsListProps) {
  const flagged = positions.filter((p) => p.tags.length > 0);
  if (flagged.length === 0) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Geen posities met aandachtspunten gedetecteerd.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aandachtspunten per positie</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {flagged.map((p) => (
          <div
            key={`${p.ticker ?? p.isin}-${p.tags.join("-")}`}
            className="rounded-md border border-border/60 bg-surface/60 p-3"
          >
            <div className="flex items-center gap-2">
              <p className="font-medium text-foreground">
                {p.name ?? p.ticker ?? p.isin ?? "—"}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {p.ticker ?? p.isin ?? ""}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.tags.map((tag) => (
                <span
                  key={tag}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                    TAG_TONES[tag],
                  )}
                >
                  {TAG_LABELS[tag]}
                </span>
              ))}
            </div>
            {p.reasons.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {p.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
