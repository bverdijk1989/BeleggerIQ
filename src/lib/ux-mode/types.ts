/**
 * UX-mode taxonomie + visibility-config.
 *
 * **Drie modi**:
 *  - BEGINNER — eenvoudige uitleg + educatieve microcopy + 4 kern-secties.
 *  - FOCUS    — minimale-maar-bruikbare set: briefing + health + risico + acties.
 *  - EXPERT   — volledige analytics: factor-breakdowns, macro, scenarios, backtest.
 *
 * **Default** = FOCUS. Spec ("less dashboard chaos, more rust") sluit
 * aan op een minimaal-default; gebruiker schakelt expliciet naar
 * EXPERT wanneer hij meer detail wil.
 *
 * **Pure functies** — geen DB. Een UI-laag roept `getDashboardVisibility(mode)`
 * en checkt per sectie `if (visibility.showHealthDetail) ...`.
 */

import type { UxMode } from "@/types/profile";

export type { UxMode };

/** Welke secties op het dashboard zichtbaar zijn. */
export interface DashboardVisibility {
  /** Bovenaan: PrimaryActionBar — altijd. */
  showPrimaryAction: boolean;
  /** Status-snapshot rij (5 KPI-kaarten). */
  showStatusSnapshot: boolean;
  /** Health-score-kaart naast status. */
  showHealthScoreCard: boolean;
  /** RiskActions-paneel. */
  showRiskActions: boolean;
  /** OpportunityPanel. */
  showOpportunities: boolean;
  /** Allocation-decision-preview. */
  showAllocationPreview: boolean;
  /** Scenario-snapshot. */
  showScenarioSnapshot: boolean;
  /** AI explain-panel (collapsible). */
  showAiExplain: boolean;
  /** Dagelijkse briefing-sectie. */
  showBriefing: boolean;
  /** Behavioral coach. */
  showBehavioralCoach: boolean;
  /** Goals-sectie. */
  showGoals: boolean;
  /** Macro-regime sectie. */
  showMacroRegime: boolean;
  /** Confidence-summary sectie. */
  showConfidenceSummary: boolean;
  /** Adviesgeschiedenis. */
  showDecisionHistory: boolean;
  /** Verdieping (regime-card + benchmark). */
  showDeepDive: boolean;
  /** Business-quality blok. */
  showBusinessQuality: boolean;
  /** Netto-rendement / tax-blok. */
  showNetReturn: boolean;
  /** Historiek-charts. */
  showHistoryCharts: boolean;
  /** Educatieve microcopy boven secties (alleen BEGINNER). */
  showEducationalMicrocopy: boolean;
}

/**
 * Welke nav-routes zichtbaar zijn per modus.
 *
 * Alle routes staan nog altijd in `NAV_ITEMS`, maar de sidebar verbergt
 * hetgeen niet bij de modus past. Direct-URL-toegang blijft werken —
 * dit is een UI-densiteit-keuze, geen permission-laag.
 */
export type NavRouteKey =
  | "/dashboard"
  | "/portfolio"
  | "/risico"
  | "/portfolio-health"
  | "/briefing"
  | "/coach"
  | "/doelen"
  | "/macro"
  | "/score"
  | "/transacties"
  | "/belasting"
  | "/maandbeslissing"
  | "/kansen"
  | "/screener"
  | "/watchlist"
  | "/strategy-lab"
  | "/backtest"
  | "/chat"
  | "/profiel"
  | "/methodologie";

const ALL_ROUTES: ReadonlyArray<NavRouteKey> = [
  "/dashboard",
  "/portfolio",
  "/risico",
  "/portfolio-health",
  "/briefing",
  "/coach",
  "/doelen",
  "/macro",
  "/score",
  "/transacties",
  "/belasting",
  "/maandbeslissing",
  "/kansen",
  "/screener",
  "/watchlist",
  "/strategy-lab",
  "/backtest",
  "/chat",
  "/profiel",
  "/methodologie",
];

/** Routes die zichtbaar zijn in BEGINNER — alleen kern-secties. */
const BEGINNER_ROUTES: ReadonlyArray<NavRouteKey> = [
  "/dashboard",
  "/portfolio",
  "/portfolio-health",
  "/doelen",
  "/coach",
  "/profiel",
  "/methodologie",
];

/** Routes in FOCUS — alle BEGINNER-routes + actie-relevante. */
const FOCUS_ROUTES: ReadonlyArray<NavRouteKey> = [
  "/dashboard",
  "/portfolio",
  "/risico",
  "/portfolio-health",
  "/briefing",
  "/coach",
  "/doelen",
  "/macro",
  "/maandbeslissing",
  "/transacties",
  "/profiel",
  "/methodologie",
];

/** Routes in EXPERT — alles zichtbaar. */
const EXPERT_ROUTES = ALL_ROUTES;

const DASHBOARD_BEGINNER: DashboardVisibility = {
  showPrimaryAction: true,
  showStatusSnapshot: true,
  showHealthScoreCard: true,
  showRiskActions: false,
  showOpportunities: false,
  showAllocationPreview: false,
  showScenarioSnapshot: false,
  showAiExplain: false,
  showBriefing: false,
  showBehavioralCoach: true,
  showGoals: true,
  showMacroRegime: false,
  showConfidenceSummary: false,
  showDecisionHistory: false,
  showDeepDive: false,
  showBusinessQuality: false,
  showNetReturn: false,
  showHistoryCharts: false,
  showEducationalMicrocopy: true,
};

const DASHBOARD_FOCUS: DashboardVisibility = {
  showPrimaryAction: true,
  showStatusSnapshot: true,
  showHealthScoreCard: true,
  showRiskActions: true,
  showOpportunities: true,
  showAllocationPreview: false,
  showScenarioSnapshot: false,
  showAiExplain: false,
  showBriefing: true,
  showBehavioralCoach: true,
  showGoals: true,
  showMacroRegime: true,
  showConfidenceSummary: false,
  showDecisionHistory: false,
  showDeepDive: false,
  showBusinessQuality: false,
  showNetReturn: false,
  showHistoryCharts: false,
  showEducationalMicrocopy: false,
};

const DASHBOARD_EXPERT: DashboardVisibility = {
  showPrimaryAction: true,
  showStatusSnapshot: true,
  showHealthScoreCard: true,
  showRiskActions: true,
  showOpportunities: true,
  showAllocationPreview: true,
  showScenarioSnapshot: true,
  showAiExplain: true,
  showBriefing: true,
  showBehavioralCoach: true,
  showGoals: true,
  showMacroRegime: true,
  showConfidenceSummary: true,
  showDecisionHistory: true,
  showDeepDive: true,
  showBusinessQuality: true,
  showNetReturn: true,
  showHistoryCharts: true,
  showEducationalMicrocopy: false,
};

const VISIBILITY_BY_MODE: Record<UxMode, DashboardVisibility> = {
  BEGINNER: DASHBOARD_BEGINNER,
  FOCUS: DASHBOARD_FOCUS,
  EXPERT: DASHBOARD_EXPERT,
};

const ROUTES_BY_MODE: Record<UxMode, ReadonlyArray<NavRouteKey>> = {
  BEGINNER: BEGINNER_ROUTES,
  FOCUS: FOCUS_ROUTES,
  EXPERT: EXPERT_ROUTES,
};

export const DEFAULT_UX_MODE: UxMode = "FOCUS";

export function getDashboardVisibility(
  mode: UxMode | null | undefined,
): DashboardVisibility {
  return VISIBILITY_BY_MODE[mode ?? DEFAULT_UX_MODE];
}

export function getVisibleNavRoutes(
  mode: UxMode | null | undefined,
): ReadonlyArray<NavRouteKey> {
  return ROUTES_BY_MODE[mode ?? DEFAULT_UX_MODE];
}

export function isRouteVisibleInMode(
  route: string,
  mode: UxMode | null | undefined,
): boolean {
  const routes = getVisibleNavRoutes(mode);
  return routes.some((r) => r === route);
}

// ============================================================
//  Labels & beschrijvingen voor de Selector-UI
// ============================================================

export const UX_MODE_LABELS: Record<UxMode, string> = {
  BEGINNER: "Beginner",
  FOCUS: "Focus",
  EXPERT: "Expert",
};

export const UX_MODE_DESCRIPTIONS: Record<UxMode, string> = {
  BEGINNER:
    "Eenvoudige uitleg met educatieve tekst. Focus op je doelen, gezondheidsscore en risico. Weinig grafieken, veel context.",
  FOCUS:
    "Alleen de belangrijkste inzichten — dagelijkse briefing, health en concrete aandachtspunten. Minimale ruis, maximale rust.",
  EXPERT:
    "Volledige analytics: factor-breakdowns, macro-data, backtesting, business-quality, scenario-analyse en alle detail-secties.",
};

export const UX_MODE_TAGLINES: Record<UxMode, string> = {
  BEGINNER: "Voor wie net begint of overzicht wil",
  FOCUS: "Voor wie weet wat hij doet en bewust handelt",
  EXPERT: "Voor wie diep in de cijfers wil",
};
