/**
 * Advisor PDF Report — types (Module 23).
 *
 * **MVP-scope**: 10 secties — titelpagina, disclaimer, health, risico's,
 * spreiding, doelvoortgang, scenario-samenvatting, behavioral, datakwaliteit,
 * actiepunten.
 *
 * **Renderer-agnostiek**: dit zijn pure data-types. HTML-renderer (v1) en
 * PDF-renderer (v2 via Puppeteer/pdfmake) lezen uit dezelfde shape.
 *
 * **Compliance-laag**: hergebruikt `ComplianceDisclaimer` + `WhiteLabelConfig`
 * uit `src/lib/enterprise` zodat AFM-tekst, white-label-branding en
 * versie-tracking centraal blijft.
 */

import type { ISODateString } from "@/types/common";

import type {
  ComplianceDisclaimer,
  WhiteLabelConfig,
} from "@/lib/enterprise/types";

/**
 * Stable section-IDs — wijzig nooit (audit-trail koppelt rapport-versies
 * aan secties). Voeg alleen toe.
 */
export type AdvisorReportSectionId =
  | "title"
  | "disclaimer"
  | "health"
  | "risks"
  | "allocation"
  | "goals"
  | "scenarios"
  | "behavioral"
  | "data_quality"
  | "action_items";

/** Sectie-1: Titelpagina. */
export interface ReportTitleSection {
  brandName: string;
  title: string;
  /** Cliëntnaam of e-mail-redacted hash; niet de volledige e-mail. */
  clientLabel: string;
  /** Wie heeft het rapport gegenereerd (display). */
  generatedBy: string;
  asOf: ISODateString;
  /** Optionele advisor-notitie aan de cliënt (1-3 zinnen). */
  advisorNote: string | null;
}

/** Sectie-3: Portfolio Health Score. */
export interface ReportHealthSection {
  score: number; // 0..100
  grade: "A" | "B" | "C" | "D" | "F";
  /** Per-component score 0..100. */
  components: Array<{
    label: string;
    score: number;
  }>;
  /** Top 3 signalen (positive/info/warning/critical). */
  topSignals: Array<{
    label: string;
    severity: string;
    message: string;
  }>;
}

/** Sectie-4: Grootste risico's. */
export interface ReportRisksSection {
  overallSeverity: string;
  /** Top 5 risico-flags op severity. */
  topFlags: Array<{
    code: string;
    label: string;
    severity: string;
    message: string;
    metric: number | null;
    threshold: number | null;
  }>;
  /** Risk-headline-metrics. */
  metrics: {
    largestPositionWeight: number;
    top5Weight: number | null;
    portfolioVolatility: number | null;
    foreignCurrencyExposure: number | null;
  };
}

/** Sectie-5: Spreiding / allocatie. */
export interface ReportAllocationSection {
  totalValue: number;
  baseCurrency: string;
  cashWeight: number;
  byAssetClass: Array<{ label: string; weight: number }>;
  bySector: Array<{ label: string; weight: number }>;
  byRegion: Array<{ label: string; weight: number }>;
  byCurrency: Array<{ label: string; weight: number }>;
}

/** Sectie-6: Doelvoortgang. */
export interface ReportGoalRow {
  name: string;
  type: string;
  targetAmount: number;
  /** ISO yyyy-mm-dd. */
  targetDate: string;
  /** Voortgang 0..1. */
  progress: number;
  feasibilityTier: string;
}

export interface ReportGoalsSection {
  /** Aantal doelen ingesteld. Null bij geen goals-data. */
  totalGoals: number;
  achievableGoals: number;
  courseStatus: string;
  /** Per-doel rij (max 10). */
  rows: ReportGoalRow[];
}

/** Sectie-7: Scenario / stress-test samenvatting. */
export interface ReportScenarioRow {
  scenario: string;
  label: string;
  severity: string;
  /** Portfolio-impact als fractie (negatief = verlies). */
  impactPct: number;
  impactAmount: number;
  verdict: string;
}

export interface ReportScenariosSection {
  /** Worst-case in pct. */
  worst: ReportScenarioRow | null;
  /** Best-case (kleinste verlies of grootste winst). */
  best: ReportScenarioRow | null;
  /** Alle 9 scenarios (canonical volgorde). */
  rows: ReportScenarioRow[];
}

/** Sectie-8: Behavioral aandachtspunten. */
export interface ReportBehavioralSignal {
  key: string;
  label: string;
  severity: string;
  title: string;
  message: string;
  ticker: string | null;
}

export interface ReportBehavioralSection {
  /** Aantal actieve signalen. */
  activeCount: number;
  counts: Record<string, number>; // severity → count
  /** Top 5 op severity. */
  topSignals: ReportBehavioralSignal[];
}

/** Sectie-9: Datakwaliteit / coverage. */
export interface ReportDataQualitySection {
  /** Posities met geldige market-value. */
  positionsWithPrice: number;
  totalPositions: number;
  /** Posities met factor-score (uit signal-fusion). */
  positionsWithFactorScore: number;
  /** Posities met fundamentals (yield/PE/etc.). */
  positionsWithFundamentals: number;
  /** Warnings — bv. "X posities missen sector-tag", "FX-rate verouderd". */
  warnings: string[];
}

/** Sectie-10: Actiepunten in gewone taal. */
export interface ReportActionItem {
  /** UI-volgorde 1..N. */
  priority: number;
  /** Korte titel — gewone taal, geen jargon. */
  title: string;
  /** 1-zin uitleg. */
  rationale: string;
  /** Bron-engine voor traceability. */
  source: "health" | "risk" | "behavioral" | "scenarios" | "goals";
}

export interface ReportActionItemsSection {
  /** Max 5 actiepunten. */
  items: ReportActionItem[];
}

// ============================================================
//  Top-level shape
// ============================================================

export interface AdvisorReportData {
  /** Schema-version — bumpen bij breaking change. */
  schemaVersion: 1;
  generatedAt: ISODateString;
  asOf: ISODateString;
  whiteLabel: WhiteLabelConfig;
  disclaimers: ReadonlyArray<ComplianceDisclaimer>;
  title: ReportTitleSection;
  health: ReportHealthSection;
  risks: ReportRisksSection;
  allocation: ReportAllocationSection;
  /** null wanneer geen goals ingesteld of geen data. */
  goals: ReportGoalsSection | null;
  /** null wanneer geen stress-test-data beschikbaar. */
  scenarios: ReportScenariosSection | null;
  behavioral: ReportBehavioralSection;
  dataQuality: ReportDataQualitySection;
  actionItems: ReportActionItemsSection;
}

/**
 * Output-format. Toekomst-vrijgehouden voor v2.
 */
export type AdvisorReportFormat = "html" | "pdf";
