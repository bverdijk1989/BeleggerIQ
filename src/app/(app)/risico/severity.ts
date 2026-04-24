import type { RiskSeverity } from "@/types/risk";

/**
 * Risk severity → Tailwind token mapping voor gedeelde visualisaties.
 * Houdt de toon rustig: "low" en "moderate" vallen binnen het kalme palet,
 * alleen "high"/"critical" breken met de destructive-kleur.
 */

export type SeverityTone = "muted" | "info" | "warning" | "destructive";

export function toneForSeverity(severity: RiskSeverity): SeverityTone {
  switch (severity) {
    case "critical":
    case "high":
      return "destructive";
    case "elevated":
      return "warning";
    case "moderate":
      return "warning";
    case "low":
    default:
      return "muted";
  }
}

export const TONE_BG: Record<SeverityTone, string> = {
  muted: "bg-surface-elevated text-muted-foreground border-border/60",
  info: "bg-primary/15 text-primary border-primary/30",
  warning: "bg-warning/15 text-warning border-warning/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
};

export const TONE_DOT: Record<SeverityTone, string> = {
  muted: "bg-muted-foreground/50",
  info: "bg-primary",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

export const SEVERITY_LABEL_NL: Record<RiskSeverity, string> = {
  low: "Laag",
  moderate: "Gemiddeld",
  elevated: "Verhoogd",
  high: "Hoog",
  critical: "Kritiek",
};
