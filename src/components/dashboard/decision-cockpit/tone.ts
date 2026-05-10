/**
 * Cockpit-tone palette — één bron van waarheid voor status-kleuren in
 * alle dashboard-kaarten (StatusMetricCard, RiskActionCard,
 * BusinessQualityCard, OpportunityCard, ScenarioImpactCard,
 * AllocationDecisionPreview).
 *
 * Vier tones — bewust beperkt om visuele chaos te voorkomen:
 *  - **good**     → emerald (+ engine-positief)
 *  - **neutral**  → border/surface (default)
 *  - **warning**  → amber (verhoogde aandacht)
 *  - **critical** → destructive (rood — kapitaalbehoud)
 *
 * Gebruik via `TONE_STYLES[tone]`-objecten zodat een component zelf geen
 * Tailwind-classen mengt en kleur niet drift tussen kaarten.
 */

export type CockpitTone = "good" | "neutral" | "warning" | "critical";

export interface CockpitToneStyle {
  /** Border + light bg voor de kaart-container. */
  container: string;
  /** Tekstkleur voor de hoofdwaarde (bv. een score). */
  value: string;
  /** Background voor het icon-vlakje rechtsboven. */
  iconBg: string;
  /** Foreground voor het icon. */
  iconFg: string;
  /** Chip/badge style — kleinere accenten. */
  chip: string;
  /** Stevige kleur voor borders / accents in tooltips. */
  accent: string;
}

/**
 * **Color-blind helper** — symbool/prefix per tone zodat informatie niet
 * uitsluitend in kleur zit. Wordt gebruikt door tone-cards die naast
 * kleur ook een tekst-prefix willen tonen ("⚠ Risico", "✓ OK", "✕ Kritiek").
 *
 * Default zijn we Lynch-laag terughoudend met emoji; voor a11y-modus
 * komt deze map handig zodra we 'em activeren.
 */
export const TONE_PREFIX: Record<CockpitTone, string> = {
  good: "✓",
  neutral: "•",
  warning: "⚠",
  critical: "✕",
};

/** Screen-reader-only label per tone — voor `<span className="sr-only">`. */
export const TONE_SR_LABEL: Record<CockpitTone, string> = {
  good: "Positief",
  neutral: "Neutraal",
  warning: "Aandachtspunt",
  critical: "Kritiek",
};

export const TONE_STYLES: Record<CockpitTone, CockpitToneStyle> = {
  good: {
    container: "border-emerald-500/40 bg-emerald-500/5",
    value: "text-emerald-200",
    iconBg: "bg-emerald-500/15",
    iconFg: "text-emerald-200",
    chip: "bg-emerald-500/15 text-emerald-200",
    accent: "text-emerald-300",
  },
  neutral: {
    container: "border-border/60 bg-surface/40",
    value: "text-foreground",
    iconBg: "bg-primary/15",
    iconFg: "text-primary",
    chip: "bg-muted/30 text-muted-foreground",
    accent: "text-muted-foreground",
  },
  warning: {
    container: "border-amber-500/40 bg-amber-500/5",
    value: "text-amber-200",
    iconBg: "bg-amber-500/15",
    iconFg: "text-amber-200",
    chip: "bg-amber-500/15 text-amber-200",
    accent: "text-amber-300",
  },
  critical: {
    container: "border-destructive/40 bg-destructive/5",
    value: "text-destructive",
    iconBg: "bg-destructive/15",
    iconFg: "text-destructive",
    chip: "bg-destructive/15 text-destructive",
    accent: "text-destructive",
  },
};
