import { ACTION_DESCRIPTIONS, ACTION_LABELS } from "@/lib/analytics/holding-action";
import type { HoldingAction } from "@/lib/analytics/holding-action";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Inklapbare legenda die uitlegt wat de scores en acties betekenen.
 * Pure server component — gebruikt geen tooltip/provider.
 */

const ACTION_ORDER: HoldingAction[] = [
  "BUY_CANDIDATE",
  "HOLD",
  "WATCH",
  "TRIM",
  "AVOID",
];

const ACTION_COLOR: Record<HoldingAction, string> = {
  BUY_CANDIDATE: "bg-success",
  HOLD: "bg-muted-foreground/60",
  WATCH: "bg-primary",
  TRIM: "bg-warning",
  AVOID: "bg-destructive",
};

const SCORE_BANDS: Array<{ label: string; range: string; tone: string }> = [
  { label: "Sterk", range: "75 – 100", tone: "bg-success" },
  { label: "Bovengemiddeld", range: "55 – 74", tone: "bg-primary" },
  { label: "Gemiddeld", range: "40 – 54", tone: "bg-muted-foreground/60" },
  { label: "Zwak", range: "25 – 39", tone: "bg-warning" },
  { label: "Zeer zwak", range: "0 – 24", tone: "bg-destructive" },
];

export function ScoreLegend() {
  return (
    <Card className="bg-surface/60">
      <CardContent className="grid gap-6 p-5 md:grid-cols-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Scores
          </p>
          <p className="mt-1 text-sm text-foreground">
            Per holding draait de juiste engine: <strong>aandelen</strong> en
            REITs op fundamentals (Quality / Value / Momentum / Risk),{" "}
            <strong>ETFs / fondsen</strong> op fund-metadata (Kosten / Schaal /
            Track-record / Pasvorm). Beide leveren een 0–100 composite die
            meegeschoven is met je beleggersprofiel.
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            {SCORE_BANDS.map((band) => (
              <li key={band.label} className="flex items-center gap-2">
                <span className={cn("h-2 w-6 rounded-full", band.tone)} />
                <span className="font-medium text-foreground">{band.label}</span>
                <span className="tabular-nums">{band.range}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted-foreground">
            ETFs zonder fund-metadata krijgen geen verzonnen fundamentals —
            ze houden een neutrale composite (50) met lage confidence tot
            een fund-data-feed wordt aangesloten.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Acties
          </p>
          <p className="mt-1 text-sm text-foreground">
            Acties zijn beslissingsregels op de composite score plus datacoverage.
            Ze vervangen geen persoonlijk oordeel — zie ze als systeemsignaal.
          </p>
          <ul className="mt-3 space-y-2 text-xs">
            {ACTION_ORDER.map((action) => (
              <li key={action} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1 h-2 w-2 shrink-0 rounded-full",
                    ACTION_COLOR[action],
                  )}
                />
                <div>
                  <p className="font-semibold uppercase tracking-wider text-foreground">
                    {ACTION_LABELS[action]}
                  </p>
                  <p className="text-muted-foreground">
                    {ACTION_DESCRIPTIONS[action]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
