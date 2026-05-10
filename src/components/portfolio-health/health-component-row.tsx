import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Info,
  ShieldAlert,
} from "lucide-react";

import {
  TONE_STYLES,
  type CockpitTone,
} from "@/components/dashboard/decision-cockpit/tone";
import { Badge } from "@/components/ui/badge";
import type {
  HealthComponent,
  HealthComponentStatus,
} from "@/lib/analytics/health-score";
import { cn } from "@/lib/utils";

/**
 * HealthComponentRow — toont één van de 10 componenten op de
 * detail-pagina. Elke rij is **zelfstandig leesbaar**: label, score,
 * status-pill, rationale en (indien zwak/critical) verbeteradviezen.
 *
 * Visueel ritme: linker progress-bar voor de score (intuïtief),
 * rechtsboven status-badge, daaronder bullet-list met recommendations.
 */

interface Props {
  component: HealthComponent;
}

const STATUS_TONE: Record<HealthComponentStatus, CockpitTone> = {
  strong: "good",
  ok: "good",
  weak: "warning",
  critical: "critical",
  no_data: "neutral",
};

const STATUS_ICON: Record<HealthComponentStatus, typeof CheckCircle2> = {
  strong: CheckCircle2,
  ok: CheckCircle2,
  weak: AlertTriangle,
  critical: ShieldAlert,
  no_data: CircleDashed,
};

const STATUS_LABEL: Record<HealthComponentStatus, string> = {
  strong: "Sterk",
  ok: "Op orde",
  weak: "Aandacht",
  critical: "Kritiek",
  no_data: "Geen data",
};

export function HealthComponentRow({ component }: Props) {
  const tone = STATUS_TONE[component.status];
  const styles = TONE_STYLES[tone];
  const Icon = STATUS_ICON[component.status];
  const isMissing = component.status === "no_data";
  const lowConfidence = component.confidence < 0.5 && !isMissing;

  return (
    <div
      className={cn(
        "rounded-md border p-4 transition-colors",
        styles.container,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4 shrink-0", styles.iconFg)} aria-hidden />
            <h4 className="text-sm font-semibold text-foreground">
              {component.label}
            </h4>
            <Badge variant="outline" className={cn("text-[10px]", styles.chip)}>
              {STATUS_LABEL[component.status]}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{component.rationale}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end">
          <span
            className={cn(
              "font-mono text-xl font-bold tabular-nums",
              isMissing ? "text-muted-foreground" : styles.value,
            )}
          >
            {isMissing ? "—" : Math.round(component.score)}
          </span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>

      {/* Progress bar — visuele intuïtie naast het cijfer. */}
      {!isMissing && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
          <div
            className={cn("h-full transition-all", styles.iconBg)}
            style={{ width: `${Math.max(2, Math.min(100, component.score))}%` }}
          />
        </div>
      )}

      {component.recommendations.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {component.recommendations.map((rec) => (
            <li
              key={rec.title}
              className="rounded border border-border/40 bg-background/40 p-2 text-xs"
            >
              <p className="font-medium text-foreground">{rec.title}</p>
              <p className="mt-0.5 text-muted-foreground">{rec.detail}</p>
              {typeof rec.expectedImpact === "number" && rec.expectedImpact > 0 && (
                <p className="mt-1 text-[10px] text-primary">
                  Verwachte impact: +{rec.expectedImpact} punten
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {(lowConfidence || isMissing) && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Info className="h-2.5 w-2.5" />
          {isMissing
            ? "Onvoldoende data om te scoren — component telt niet mee in de totaalscore."
            : `Lage confidence (${Math.round(component.confidence * 100)}%) — meting wankel.`}
        </p>
      )}

      <p className="mt-2 text-[10px] text-muted-foreground">
        Gewicht: {(component.weight * 100).toFixed(0)}% · Bijdrage: {component.contribution.toFixed(1)}
      </p>
    </div>
  );
}
