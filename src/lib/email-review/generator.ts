/**
 * Monthly Investor Review — pure-function data-generator (Module 34).
 *
 * Bouwt de 6 secties uit reeds-berekende rapporten (risk-trend, risk-tower,
 * wealth, alerts, data-depth). Geen I/O — caller (loader) hydrateert.
 *
 * **Privacy-by-default**: standaard tonen we GEEN bedragen of exacte
 * portfolio-waarde. Alleen grades, score-deltas en kwalitatieve labels.
 * Bij `detailedFigures: true` mag de generator óók exacte cijfers in de
 * body zetten.
 */

import type { ISODateString } from "@/types/common";

import {
  MONTHLY_REVIEW_DISCLAIMER,
  SECTION_LABELS,
  type MonthlyReviewData,
  type ReviewSection,
} from "./types";

export interface BuildMonthlyReviewInput {
  generatedAt: ISODateString;
  periodLabel: string;
  greetingName: string;
  detailedFigures: boolean;
  unsubscribeUrl: string;
  appUrl: string;

  /** Health-Score nu (0..100) en vorige maand. null = geen data. */
  healthScoreNow: number | null;
  healthScorePrev: number | null;
  healthGrade: string | null;

  /** Grootste risico — label + severity. */
  topRisk: {
    label: string;
    severity: "green" | "orange" | "red" | "gray";
  } | null;

  /** Doelvoortgang — aantal haalbaar / totaal + course-status. */
  goals: {
    totalGoals: number;
    achievableGoals: number;
    courseStatus: string;
  } | null;

  /** Maandactie — titel + kind. */
  monthlyAction: {
    title: string;
    kind: "buy" | "trim" | "hold" | "review";
  } | null;

  /** Belangrijkste alert — titel + severity. */
  topAlert: {
    title: string;
    severity: "info" | "warning" | "critical";
  } | null;

  /** Datakwaliteit — depth-score 0..100 + tier-label. */
  dataQuality: {
    depthScore: number;
    tierLabel: string;
  } | null;
}

/**
 * Hoofd-generator.
 */
export function buildMonthlyReview(
  input: BuildMonthlyReviewInput,
): MonthlyReviewData {
  const sections: ReviewSection[] = [
    buildHealthChange(input),
    buildBiggestRisk(input),
    buildGoalProgress(input),
    buildMonthlyAction(input),
    buildTopAlert(input),
    buildDataQuality(input),
  ];

  return {
    periodLabel: input.periodLabel,
    generatedAt: input.generatedAt,
    greetingName: input.greetingName,
    sections,
    headline: buildHeadline(sections),
    detailedFigures: input.detailedFigures,
    unsubscribeUrl: input.unsubscribeUrl,
    appUrl: input.appUrl,
    disclaimer: MONTHLY_REVIEW_DISCLAIMER,
  };
}

// ============================================================
//  Section builders
// ============================================================

function buildHealthChange(input: BuildMonthlyReviewInput): ReviewSection {
  const key = "health_change" as const;
  const label = SECTION_LABELS[key];

  if (input.healthScoreNow === null) {
    return {
      key,
      label,
      body: "Nog geen Health Score beschikbaar — voeg posities toe voor je eerste meting.",
      tone: "info",
      hasData: false,
    };
  }

  const now = Math.round(input.healthScoreNow);
  const gradePart = input.healthGrade ? ` (grade ${input.healthGrade})` : "";

  if (input.healthScorePrev === null) {
    return {
      key,
      label,
      body: `Je Health Score staat op ${now}/100${gradePart}. Volgende maand zie je hier de verandering.`,
      tone: "neutral",
      hasData: true,
    };
  }

  const prev = Math.round(input.healthScorePrev);
  const delta = now - prev;
  if (Math.abs(delta) < 3) {
    return {
      key,
      label,
      body: `Je Health Score is stabiel rond ${now}/100${gradePart} — nauwelijks veranderd t.o.v. vorige maand.`,
      tone: "neutral",
      hasData: true,
    };
  }
  if (delta > 0) {
    return {
      key,
      label,
      body: `Je Health Score verbeterde van ${prev} naar ${now}/100${gradePart}. De gezondheid van je portefeuille ging vooruit.`,
      tone: "positive",
      hasData: true,
    };
  }
  return {
    key,
    label,
    body: `Je Health Score daalde van ${prev} naar ${now}/100${gradePart}. Bekijk in de app welke component verzwakte.`,
    tone: "warning",
    hasData: true,
  };
}

function buildBiggestRisk(input: BuildMonthlyReviewInput): ReviewSection {
  const key = "biggest_risk" as const;
  const label = SECTION_LABELS[key];

  if (!input.topRisk) {
    return {
      key,
      label,
      body: "Geen verhoogd risico gedetecteerd deze maand. Je portefeuille toont brede spreiding.",
      tone: "positive",
      hasData: true,
    };
  }

  const sev = input.topRisk.severity;
  if (sev === "red") {
    return {
      key,
      label,
      body: `Aandachtspunt: ${input.topRisk.label} staat op hoog risico. Bekijk de Risk Control Tower voor de details.`,
      tone: "warning",
      hasData: true,
    };
  }
  if (sev === "orange") {
    return {
      key,
      label,
      body: `Let op: ${input.topRisk.label} is verhoogd — geen alarm, wel iets om te volgen.`,
      tone: "warning",
      hasData: true,
    };
  }
  return {
    key,
    label,
    body: `Risico's zijn deze maand beheerst. Grootste aandachtspunt: ${input.topRisk.label}.`,
    tone: "neutral",
    hasData: true,
  };
}

function buildGoalProgress(input: BuildMonthlyReviewInput): ReviewSection {
  const key = "goal_progress" as const;
  const label = SECTION_LABELS[key];

  if (!input.goals || input.goals.totalGoals === 0) {
    return {
      key,
      label,
      body: "Je hebt nog geen financiële doelen ingesteld. Eén concreet doel maakt je voortgang elke maand zichtbaar.",
      tone: "info",
      hasData: false,
    };
  }

  const { achievableGoals, totalGoals } = input.goals;
  if (achievableGoals === totalGoals) {
    return {
      key,
      label,
      body:
        totalGoals === 1
          ? "Je doel ligt op koers — mooi resultaat van je discipline."
          : `Alle ${totalGoals} doelen liggen op koers.`,
      tone: "positive",
      hasData: true,
    };
  }
  return {
    key,
    label,
    body: `${achievableGoals} van ${totalGoals} doelen liggen op koers. Bekijk in de app welke aandacht vraagt.`,
    tone: achievableGoals >= totalGoals * 0.5 ? "neutral" : "warning",
    hasData: true,
  };
}

function buildMonthlyAction(input: BuildMonthlyReviewInput): ReviewSection {
  const key = "monthly_action" as const;
  const label = SECTION_LABELS[key];

  if (!input.monthlyAction) {
    return {
      key,
      label,
      body: "Geen specifieke maandactie deze maand — je portefeuille lijkt in balans. Houd vast aan je plan.",
      tone: "neutral",
      hasData: true,
    };
  }

  // Privacy-laag: titel kan een ticker bevatten — dat is geen gevoelige
  // PII (ticker is publiek), wel houden we het kort. Geen bedragen.
  return {
    key,
    label,
    body: `Suggestie deze maand: ${input.monthlyAction.title}. Dit is geen koopadvies — log in voor de onderliggende rationale.`,
    tone: "info",
    hasData: true,
  };
}

function buildTopAlert(input: BuildMonthlyReviewInput): ReviewSection {
  const key = "top_alert" as const;
  const label = SECTION_LABELS[key];

  if (!input.topAlert) {
    return {
      key,
      label,
      body: "Geen belangrijke meldingen deze maand. Rustige maand voor je portefeuille.",
      tone: "positive",
      hasData: true,
    };
  }

  const tone =
    input.topAlert.severity === "critical"
      ? "warning"
      : input.topAlert.severity === "warning"
        ? "warning"
        : "info";
  return {
    key,
    label,
    body: `${input.topAlert.title}. Bekijk het notificatiecentrum voor de volledige context.`,
    tone,
    hasData: true,
  };
}

function buildDataQuality(input: BuildMonthlyReviewInput): ReviewSection {
  const key = "data_quality" as const;
  const label = SECTION_LABELS[key];

  if (!input.dataQuality) {
    return {
      key,
      label,
      body: "Datakwaliteit wordt nog gemeten. Volgende maand zie je hier hoe compleet de data achter je analyses is.",
      tone: "info",
      hasData: false,
    };
  }

  const score = Math.round(input.dataQuality.depthScore);
  if (score >= 70) {
    return {
      key,
      label,
      body: `Datadekking is ${input.dataQuality.tierLabel.toLowerCase()} (${score}/100) — je analyses staan op een solide basis.`,
      tone: "positive",
      hasData: true,
    };
  }
  if (score >= 50) {
    return {
      key,
      label,
      body: `Datadekking is ${input.dataQuality.tierLabel.toLowerCase()} (${score}/100). Sommige geavanceerde signalen blijven indicatief.`,
      tone: "neutral",
      hasData: true,
    };
  }
  return {
    key,
    label,
    body: `Datadekking is beperkt (${score}/100). Scores blijven indicatief — bekijk in de app welke posities data missen.`,
    tone: "warning",
    hasData: true,
  };
}

// ============================================================
//  Headline
// ============================================================

function buildHeadline(sections: ReadonlyArray<ReviewSection>): string {
  const warnings = sections.filter((s) => s.tone === "warning").length;
  const positives = sections.filter((s) => s.tone === "positive").length;

  if (warnings >= 2) {
    return "Een paar aandachtspunten deze maand — niets alarmerend, wel het bekijken waard.";
  }
  if (warnings === 1) {
    return "Je portefeuille is grotendeels op koers, met één aandachtspunt.";
  }
  if (positives >= 3) {
    return "Sterke maand: je portefeuille toont brede gezondheid en discipline.";
  }
  return "Een rustige maand voor je portefeuille — hier is je korte overzicht.";
}
