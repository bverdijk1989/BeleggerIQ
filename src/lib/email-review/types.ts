/**
 * Email Drip & Monthly Investor Review — types (Module 34).
 *
 * **Doel**: maandelijkse, korte e-mail die de gebruiker terugbrengt naar
 * de app. 6 secties: health-delta, grootste risico, doelvoortgang,
 * maandactie, belangrijkste alert, datakwaliteit.
 *
 * **Privacy-by-default**:
 *  - Standaard tonen we GEEN bedragen — alleen grades, deltas en
 *    kwalitatieve labels ("verbeterd", "verhoogd risico")
 *  - Exacte cijfers/bedragen alleen wanneer `detailedFigures` opt-in
 *  - Elke e-mail bevat een unsubscribe-link (HMAC-token, geen auth nodig)
 *  - Geen koop/verkoop-advies
 */

import type { ISODateString } from "@/types/common";

/** Eén sectie in de review. */
export interface ReviewSection {
  /** Stable key — i18n + audit. */
  key:
    | "health_change"
    | "biggest_risk"
    | "goal_progress"
    | "monthly_action"
    | "top_alert"
    | "data_quality";
  /** UI-label NL. */
  label: string;
  /** Privacy-veilige hoofdtekst — geen bedragen tenzij opt-in. */
  body: string;
  /** Tone voor UI/email-kleur. */
  tone: "positive" | "neutral" | "warning" | "info";
  /** True wanneer deze sectie data had; false → "nog geen data". */
  hasData: boolean;
}

/**
 * Volledige review-payload. Renderer produceert hieruit HTML + text.
 */
export interface MonthlyReviewData {
  /** Periode-label ("mei 2026"). */
  periodLabel: string;
  generatedAt: ISODateString;
  /** Gemaskeerde begroeting-naam ("Belegger" of voornaam indien bekend). */
  greetingName: string;
  /** 6 secties in vaste volgorde. */
  sections: ReadonlyArray<ReviewSection>;
  /** 1-zin samenvatting bovenaan. */
  headline: string;
  /** Of detailed-figures opt-in actief was bij generatie. */
  detailedFigures: boolean;
  /** Unsubscribe-URL (absolute, met HMAC-token). */
  unsubscribeUrl: string;
  /** Deep-link naar de app (dashboard). */
  appUrl: string;
  /** Verplichte disclaimer. */
  disclaimer: string;
}

/** Gerenderde e-mail — beide formaten. */
export interface RenderedReviewEmail {
  subject: string;
  html: string;
  text: string;
}

/** Vaste sectie-volgorde. */
export const SECTION_ORDER: ReadonlyArray<ReviewSection["key"]> = [
  "health_change",
  "biggest_risk",
  "goal_progress",
  "monthly_action",
  "top_alert",
  "data_quality",
];

export const SECTION_LABELS: Record<ReviewSection["key"], string> = {
  health_change: "Health Score-verandering",
  biggest_risk: "Grootste risico",
  goal_progress: "Doelvoortgang",
  monthly_action: "Maandactie",
  top_alert: "Belangrijkste melding",
  data_quality: "Datakwaliteit",
};

/** Verplichte disclaimer onder elke e-mail. */
export const MONTHLY_REVIEW_DISCLAIMER =
  "Deze maandelijkse review is een samenvatting ter informatie. Het is geen persoonlijk financieel advies en geen koop/verkoop-aanbeveling. BeleggerIQ is geen broker. Cijfers in deze e-mail zijn bewust beperkt — log in voor het volledige beeld.";
