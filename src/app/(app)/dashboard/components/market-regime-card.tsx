import { Activity, Shield, TrendingUp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn, formatPercent } from "@/lib/utils";
import type {
  MarketRegimeScore,
  MarketRegimeStance,
  RegimeSubScore,
} from "@/types/regime";

interface MarketRegimeCardProps {
  regime: MarketRegimeScore;
}

const STANCE_LABEL: Record<MarketRegimeStance, string> = {
  RISK_ON: "Risk-on",
  NEUTRAL: "Neutraal",
  DEFENSIVE: "Defensief",
};

const STANCE_TONE: Record<MarketRegimeStance, string> = {
  RISK_ON: "bg-success/15 text-success border-success/30",
  NEUTRAL: "bg-primary/15 text-primary border-primary/30",
  DEFENSIVE: "bg-destructive/15 text-destructive border-destructive/30",
};

function stanceIcon(stance: MarketRegimeStance) {
  switch (stance) {
    case "RISK_ON":
      return TrendingUp;
    case "DEFENSIVE":
      return Shield;
    case "NEUTRAL":
    default:
      return Activity;
  }
}

/**
 * Dashboard-kaart voor de MarketRegimeScore. Toont stance + score + narrative
 * plus een mini-tabel van de vier/vijf sub-drivers. Pure presentation.
 */
export function MarketRegimeCard({ regime }: MarketRegimeCardProps) {
  const Icon = stanceIcon(regime.stance);
  const updatedAt = new Date(regime.asOf).toLocaleString("nl-NL");

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-md border",
                STANCE_TONE[regime.stance],
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Marktregime
              </p>
              <p className="text-lg font-semibold tracking-tight text-foreground">
                {STANCE_LABEL[regime.stance]} · {regime.score}/100
              </p>
              <p className="text-xs text-muted-foreground">
                Coverage {formatPercent(regime.confidence)} · bijgewerkt {updatedAt}
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">{regime.narrative}</p>

        <ul className="space-y-2 pt-1">
          {regime.subDrivers.map((driver) => (
            <SubDriverRow key={driver.key} driver={driver} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SubDriverRow({ driver }: { driver: RegimeSubScore }) {
  const bar = driver.score ?? 50;
  const tone =
    driver.score === null
      ? "muted"
      : driver.score >= 65
        ? "risk-on"
        : driver.score <= 35
          ? "defensive"
          : "neutral";
  const barClass =
    tone === "risk-on"
      ? "bg-success/70"
      : tone === "defensive"
        ? "bg-destructive/70"
        : tone === "neutral"
          ? "bg-primary/70"
          : "bg-muted-foreground/40";

  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{driver.label}</span>
        <span className="tabular-nums text-muted-foreground">
          {driver.score !== null ? `${driver.score}/100` : "geen data"}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated/60">
        <div
          className={cn("h-full rounded-full", barClass)}
          style={{ width: `${Math.max(4, Math.min(100, bar))}%` }}
        />
      </div>
      {driver.rationale && (
        <p className="text-[11px] text-muted-foreground">{driver.rationale}</p>
      )}
    </li>
  );
}
