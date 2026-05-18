/**
 * Onboarding 5-step wizard — pure-function laag (Module 20).
 *
 * Bewust een pure type + validator + step-mapping zonder UI-state.
 * De client-component is dom: client houdt huidige step + ingevulde
 * waarden, server-action slaat finale `OnboardingPreferences` op.
 *
 * **Bestaande 3-step state-machine** (`state.ts`) blijft voor de
 * post-preferences onboarding-status (heeft profile/portfolio/snapshot
 * uitgevoerd?). Module 20 voegt een **pre-flight wizard** toe die de
 * profile-velden invult zodat het First-Value-dashboard meteen relevant
 * is.
 */

import type {
  InvestmentObjective,
  RiskTolerance,
  UxMode,
} from "@/types/profile";

// ============================================================
//  Step-keys + canonical volgorde
// ============================================================

export type WizardStep =
  | "OBJECTIVE"
  | "EXPERIENCE"
  | "RISK"
  | "STYLE"
  | "PORTFOLIO";

export const WIZARD_STEP_ORDER: ReadonlyArray<WizardStep> = [
  "OBJECTIVE",
  "EXPERIENCE",
  "RISK",
  "STYLE",
  "PORTFOLIO",
];

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  OBJECTIVE: "Wat is je beleggingsdoel?",
  EXPERIENCE: "Hoeveel ervaring heb je?",
  RISK: "Hoeveel risico ben je bereid te nemen?",
  STYLE: "Welke beleggingsstijl past bij jou?",
  PORTFOLIO: "Begin met je portefeuille",
};

// ============================================================
//  Beleggingsstijl — extra wizard-veld, niet 1-op-1 in DB-profiel
// ============================================================

export type InvestmentStyle =
  | "ETF" // breed gespreid, indexfondsen
  | "DIVIDEND" // inkomen uit uitkeringen
  | "STOCKS" // individuele aandelen
  | "CRYPTO" // BTC/ETH-exposure
  | "MIXED"; // combinatie

export const INVESTMENT_STYLE_LABELS: Record<InvestmentStyle, string> = {
  ETF: "ETF & indexfondsen",
  DIVIDEND: "Dividend-aandelen",
  STOCKS: "Individuele aandelen",
  CRYPTO: "Crypto (BTC/ETH)",
  MIXED: "Mix van alles",
};

export const INVESTMENT_STYLE_DESCRIPTIONS: Record<InvestmentStyle, string> = {
  ETF: "Brede spreiding via indexfondsen. Lage kosten, weinig onderhoud.",
  DIVIDEND: "Focus op aandelen die uitkeringen doen. Inkomen + stabiliteit.",
  STOCKS: "Zelf bedrijven kiezen op kwaliteit, momentum of waardering.",
  CRYPTO: "BTC en ETH als alternatieve asset. Risicolaag — geen casino.",
  MIXED: "Combinatie van ETF + aandelen, eventueel met cash-buffer.",
};

// ============================================================
//  Portfolio-bron (laatste stap)
// ============================================================

export type PortfolioBootstrap = "MANUAL" | "DEMO" | "IMPORT_LATER";

export const PORTFOLIO_BOOTSTRAP_LABELS: Record<PortfolioBootstrap, string> = {
  MANUAL: "Ik voeg mijn posities zelf toe",
  DEMO: "Toon een demo-portefeuille zodat ik kan kijken",
  IMPORT_LATER: "Ik importeer later (DEGIRO CSV / Coinbase)",
};

// ============================================================
//  Geconsolideerde preferences-shape
// ============================================================

export interface OnboardingPreferences {
  objective: InvestmentObjective;
  uxMode: UxMode; // afgeleid van "ervaring"
  riskTolerance: RiskTolerance;
  style: InvestmentStyle;
  portfolioBootstrap: PortfolioBootstrap;
}

export function defaultPreferences(): OnboardingPreferences {
  return {
    objective: "BALANCED",
    uxMode: "FOCUS",
    riskTolerance: "BALANCED",
    style: "ETF",
    portfolioBootstrap: "MANUAL",
  };
}

// ============================================================
//  Validatie
// ============================================================

const ALLOWED_OBJECTIVES: ReadonlyArray<InvestmentObjective> = [
  "GROWTH",
  "INCOME",
  "BALANCED",
  "CAPITAL_PRESERVATION",
  "RETIREMENT",
  "FIRE",
  "CUSTOM",
];

const ALLOWED_UX_MODES: ReadonlyArray<UxMode> = [
  "BEGINNER",
  "FOCUS",
  "EXPERT",
];

const ALLOWED_RISK: ReadonlyArray<RiskTolerance> = [
  "CONSERVATIVE",
  "BALANCED",
  "GROWTH",
  "AGGRESSIVE",
];

const ALLOWED_STYLES: ReadonlyArray<InvestmentStyle> = [
  "ETF",
  "DIVIDEND",
  "STOCKS",
  "CRYPTO",
  "MIXED",
];

const ALLOWED_BOOTSTRAP: ReadonlyArray<PortfolioBootstrap> = [
  "MANUAL",
  "DEMO",
  "IMPORT_LATER",
];

export interface PreferencesValidationResult {
  ok: boolean;
  errors: ReadonlyArray<string>;
}

export function validatePreferences(
  input: unknown,
): PreferencesValidationResult {
  if (input === null || typeof input !== "object") {
    return { ok: false, errors: ["Preferences moet een object zijn."] };
  }
  const v = input as Record<string, unknown>;
  const errors: string[] = [];

  if (!ALLOWED_OBJECTIVES.includes(v.objective as InvestmentObjective)) {
    errors.push(`Ongeldig doel: ${String(v.objective)}`);
  }
  if (!ALLOWED_UX_MODES.includes(v.uxMode as UxMode)) {
    errors.push(`Ongeldige ervaring/uxMode: ${String(v.uxMode)}`);
  }
  if (!ALLOWED_RISK.includes(v.riskTolerance as RiskTolerance)) {
    errors.push(`Ongeldig risico-niveau: ${String(v.riskTolerance)}`);
  }
  if (!ALLOWED_STYLES.includes(v.style as InvestmentStyle)) {
    errors.push(`Ongeldige stijl: ${String(v.style)}`);
  }
  if (
    !ALLOWED_BOOTSTRAP.includes(v.portfolioBootstrap as PortfolioBootstrap)
  ) {
    errors.push(
      `Ongeldige portfolio-bootstrap: ${String(v.portfolioBootstrap)}`,
    );
  }
  return { ok: errors.length === 0, errors };
}

// ============================================================
//  Step-navigatie helpers
// ============================================================

export function nextStep(current: WizardStep): WizardStep | null {
  const idx = WIZARD_STEP_ORDER.indexOf(current);
  if (idx < 0 || idx >= WIZARD_STEP_ORDER.length - 1) return null;
  return WIZARD_STEP_ORDER[idx + 1]!;
}

export function previousStep(current: WizardStep): WizardStep | null {
  const idx = WIZARD_STEP_ORDER.indexOf(current);
  if (idx <= 0) return null;
  return WIZARD_STEP_ORDER[idx - 1]!;
}

export function stepIndex(step: WizardStep): number {
  return WIZARD_STEP_ORDER.indexOf(step) + 1;
}

export function wizardProgressPercent(current: WizardStep): number {
  // Step N van 5 = (N / 5) × 100, met laatste stap = 100 bij voltooid
  const idx = stepIndex(current);
  return Math.round((idx / WIZARD_STEP_ORDER.length) * 100);
}
