import type {
  MacroScenarioId,
  MacroScenarioReport,
  MacroScenarioResult,
  PositionImpact,
} from "@/lib/analytics/macro";
import type { Currency } from "@/types/common";
import type { MarketRegimeScore } from "@/types/regime";
import type { RiskTolerance } from "@/types/profile";

/**
 * Scenario snapshot — pure aggregator boven op de macro/scenario engine.
 *
 * De macro-engine levert al per scenario impact in fractie + euros + top
 * losers/winners + verdict. Voor het dashboard verkleinen we de output
 * tot **maximaal 4 compacte scenario-kaarten** met:
 *   - `scenarioName` (NL)
 *   - `estimatedImpactAmount` (base currency, indicatief)
 *   - `estimatedImpactPercent` (fractie)
 *   - `mainDrivers` (max 3 ticker-namen die de impact dragen)
 *   - `suggestedPreparation` (NL imperatief — geen "koop nu")
 *   - `confidence` (0..1) + `dataWarnings`
 *
 * Reproduceerbaar: identieke (macroReport, regime, riskTolerance,
 * foreignCurrencyWeight) → identieke output. Geen AI. Geen externe state.
 *
 * Strategie:
 *   1. Map elk macro-scenario naar een dashboard-kaart.
 *   2. Genereer een 4e kaart **DEFENSIVE_REGIME_WORSENS** als de
 *      macro-engine die niet levert (engine kent {RATES_UP_2,
 *      MARKET_CRASH, USD_UP_10, RECESSION}). We sturen de engine-
 *      `RECESSION` om als "defensief regime verslechtert" wanneer
 *      `regime.stance === "DEFENSIVE"`; anders blijft 'ie als RECESSION
 *      zichtbaar maar met andere copy.
 *   3. **suggestedPreparation** wordt deterministisch afgeleid:
 *        - portfolio-impact ≤ -10% én regime DEFENSIVE óf riskTolerance
 *          CONSERVATIVE → "verlaag risico-blootstelling".
 *        - portfolio-impact ≤ -5% → "controleer hedge / cash-buffer".
 *        - USD-scenario en `foreignCurrencyWeight` ≥ 0.6 → "overweeg
 *          EUR-hedged variant".
 *        - anders: "geen voorbereiding nodig — portefeuille robuust".
 *   4. **confidence** = 0.6 + (defensiveStrength/250) − (warnings*0.1),
 *      clamped op [0..1]. Bij `MacroScenarioResult.warnings.length > 0`
 *      tonen we duidelijk "indicatief".
 *
 * UI berekent niets — alle copy en getallen komen uit deze module.
 */

// ============================================================
//  Types
// ============================================================

export type DashboardScenarioId =
  | MacroScenarioId
  | "DEFENSIVE_REGIME_WORSENS";

export type DashboardScenarioTone =
  | "negative"
  | "neutral"
  | "positive";

export interface DashboardScenarioCard {
  /** Stabiel id — gelijk aan scenario-name slug. */
  id: DashboardScenarioId;
  /** NL-naam: "Markt -20%", "Rente +2%", enz. */
  scenarioName: string;
  /** Korte één-zin uitleg uit de engine (description). */
  description: string;
  /** Indicatieve euro-impact (negatief = verlies). */
  estimatedImpactAmount: number;
  /** Fractie (-0.18 = -18%). */
  estimatedImpactPercent: number;
  /** Max 3 ticker-strings die de impact dragen. */
  mainDrivers: string[];
  /** NL imperatief — geen "koop nu". */
  suggestedPreparation: string;
  /** Tone voor UI-kleur. */
  tone: DashboardScenarioTone;
  /** 0..1; daalt bij engine-warnings of ontbrekende data. */
  confidence: number;
  /** True wanneer de simulatie indicatief is (data-onzekerheid). */
  indicative: boolean;
  /** Engine-warnings (top-3). */
  dataWarnings: string[];
}

export interface DashboardScenarioSnapshot {
  baseCurrency: Currency;
  generatedAt: string;
  /** Max 4 kaarten. */
  cards: DashboardScenarioCard[];
  /** True wanneer ten minste één kaart `indicative=true` is. */
  hasIndicativeCards: boolean;
}

export interface BuildScenarioSnapshotInput {
  macroReport: MacroScenarioReport | null;
  /** Regime-stance gebruikt voor defensieve-regime kaart en preparation-tone. */
  regime: MarketRegimeScore | null;
  /** Risk-tolerance van user — escaleert preparation-text. */
  riskTolerance: RiskTolerance | null;
  /** Aandeel niet-base-currency (0..1) — beïnvloedt USD-kaart preparation. */
  foreignCurrencyWeight: number;
  /** Default 4. */
  maxCards?: number;
}

// ============================================================
//  Drempels
// ============================================================

const SEVERE_LOSS_PCT = -0.10;
const MODERATE_LOSS_PCT = -0.05;
const HIGH_FX_EXPOSURE = 0.6;

// ============================================================
//  Builder
// ============================================================

export function buildScenarioSnapshot(
  input: BuildScenarioSnapshotInput,
): DashboardScenarioSnapshot {
  const max = input.maxCards ?? 4;
  const baseCurrency: Currency =
    input.macroReport?.baseCurrency ?? "EUR";

  if (!input.macroReport || input.macroReport.scenarios.length === 0) {
    return {
      baseCurrency,
      generatedAt: new Date().toISOString(),
      cards: [],
      hasIndicativeCards: false,
    };
  }

  // Defensieve-regime kaart leiden we deterministisch af uit RECESSION
  // (zelfde sectorshocks). Wanneer 'ie aanwezig is, **vervangt** 'ie de
  // RECESSION-kaart om dubbele dekking en max-4-overflow te voorkomen.
  const defensiveCard = buildDefensiveRegimeCard({
    macroReport: input.macroReport,
    regime: input.regime,
    riskTolerance: input.riskTolerance,
  });
  const dropRecession = defensiveCard !== null;

  const cards: DashboardScenarioCard[] = [];
  for (const scenario of input.macroReport.scenarios) {
    if (dropRecession && scenario.scenario === "RECESSION") continue;
    cards.push(
      buildCard({
        scenario,
        regime: input.regime,
        riskTolerance: input.riskTolerance,
        foreignCurrencyWeight: input.foreignCurrencyWeight,
      }),
    );
  }
  if (defensiveCard) cards.push(defensiveCard);

  // Sorteer op zwaarste impact eerst (meest negatief), zodat de slechtste
  // kaart bovenaan staat — daar wil de gebruiker eerst naar kijken.
  cards.sort((a, b) => a.estimatedImpactPercent - b.estimatedImpactPercent);

  const limited = cards.slice(0, max);

  return {
    baseCurrency,
    generatedAt: input.macroReport.generatedAt,
    cards: limited,
    hasIndicativeCards: limited.some((c) => c.indicative),
  };
}

// ============================================================
//  Sub-builders (pure)
// ============================================================

interface BuildCardContext {
  scenario: MacroScenarioResult;
  regime: MarketRegimeScore | null;
  riskTolerance: RiskTolerance | null;
  foreignCurrencyWeight: number;
}

function buildCard(ctx: BuildCardContext): DashboardScenarioCard {
  const s = ctx.scenario;
  const drivers = pickMainDrivers(s.biggestLosers);
  const preparation = derivePreparation({
    scenarioId: s.scenario,
    portfolioImpact: s.portfolioImpact,
    regime: ctx.regime,
    riskTolerance: ctx.riskTolerance,
    foreignCurrencyWeight: ctx.foreignCurrencyWeight,
  });
  const tone = deriveTone(s.portfolioImpact);
  const confidence = deriveConfidence(s);
  const indicative = isIndicative(s);

  return {
    id: s.scenario,
    scenarioName: s.label,
    description: s.description,
    estimatedImpactAmount: round0(s.portfolioImpactAmount),
    estimatedImpactPercent: round4(s.portfolioImpact),
    mainDrivers: drivers,
    suggestedPreparation: preparation,
    tone,
    confidence: round2(confidence),
    indicative,
    dataWarnings: s.warnings.slice(0, 3),
  };
}

interface BuildDefensiveContext {
  macroReport: MacroScenarioReport;
  regime: MarketRegimeScore | null;
  riskTolerance: RiskTolerance | null;
}

function buildDefensiveRegimeCard(
  ctx: BuildDefensiveContext,
): DashboardScenarioCard | null {
  // We piggy-backen op de RECESSION-cijfers: de engine-aanname is dat
  // recessie ~~ defensief regime dat verslechtert, want beide raken
  // dezelfde sectoren. We verschuiven alleen de copy + naam.
  const recession = ctx.macroReport.scenarios.find(
    (s) => s.scenario === "RECESSION",
  );
  if (!recession) return null;

  // Dempen wanneer regime al defensief: de portefeuille is dan typisch
  // al voorzichtiger gepositioneerd. We trekken 30% van de impact af
  // (heuristiek; impact wordt minder negatief).
  const dampening =
    ctx.regime?.stance === "DEFENSIVE" ? 0.7 : 1.0;
  const impactPct = recession.portfolioImpact * dampening;
  const impactAmount = recession.portfolioImpactAmount * dampening;

  const preparation = derivePreparation({
    scenarioId: "DEFENSIVE_REGIME_WORSENS",
    portfolioImpact: impactPct,
    regime: ctx.regime,
    riskTolerance: ctx.riskTolerance,
    foreignCurrencyWeight: 0,
  });

  return {
    id: "DEFENSIVE_REGIME_WORSENS",
    scenarioName: "Defensief regime verslechtert",
    description:
      "Marktregime verschuift verder naar defensief; cyclische posities krimpen, defensieve sectoren houden stand.",
    estimatedImpactAmount: round0(impactAmount),
    estimatedImpactPercent: round4(impactPct),
    mainDrivers: pickMainDrivers(recession.biggestLosers),
    suggestedPreparation: preparation,
    tone: deriveTone(impactPct),
    confidence: round2(deriveConfidence(recession) * 0.9),
    indicative: true, // afgeleide — markeer altijd als indicatief
    dataWarnings: recession.warnings.slice(0, 3),
  };
}

function pickMainDrivers(losers: PositionImpact[]): string[] {
  return losers.slice(0, 3).map((l) => l.ticker);
}

interface PreparationContext {
  scenarioId: DashboardScenarioId;
  portfolioImpact: number;
  regime: MarketRegimeScore | null;
  riskTolerance: RiskTolerance | null;
  foreignCurrencyWeight: number;
}

function derivePreparation(ctx: PreparationContext): string {
  // 0. Tail-risk-pad — Taleb/Marks-laag: deze scenario's zijn zeldzaam
  // maar niet onmogelijk; voorbereiding is structureel en blijvend.
  if (ctx.scenarioId === "BLACK_SWAN") {
    return "Tail-event: bouw permanente buffers (cash 5-15%, defensieve allocatie, hedges). Verwacht niet dat 'defensief' alleen je redt — correlaties spiken in echte stress.";
  }
  if (ctx.scenarioId === "TOP_POSITION_BLOWUP") {
    return "Verlaag idiosyncratisch risico: zorg dat geen positie meer dan 10% van je portefeuille weegt. Deze scenario raakt je het hardst bij concentratie.";
  }

  // 1. USD-scenario + hoge FX-exposure → expliciete hedge-suggestie.
  if (
    ctx.scenarioId === "USD_UP_10" &&
    ctx.foreignCurrencyWeight >= HIGH_FX_EXPOSURE
  ) {
    return "Overweeg een EUR-hedged variant of EUR-genoteerd alternatief — meer dan 60% staat in vreemde valuta.";
  }

  // 2. Zware verlies-scenario in defensief regime of bij conservatieve user.
  if (
    ctx.portfolioImpact <= SEVERE_LOSS_PCT &&
    (ctx.regime?.stance === "DEFENSIVE" ||
      ctx.riskTolerance === "CONSERVATIVE")
  ) {
    return "Verlaag risico-blootstelling: bouw de zwaarst-geraakte posities af of voeg defensieve allocatie toe.";
  }

  // 3. Significante verlies-impact (≤ -5%) — controleer hedge / cash.
  if (ctx.portfolioImpact <= MODERATE_LOSS_PCT) {
    return "Controleer cash-buffer en hedge-mogelijkheden — impact is materieel zonder voorbereiding.";
  }

  // 4. Defensief regime verslechtert (eigen scenario) — andere copy.
  if (ctx.scenarioId === "DEFENSIVE_REGIME_WORSENS") {
    return "Houd defensieve allocatie aan; vermijd ramping van cyclische posities zolang regime niet verbetert.";
  }

  // 5. Default: portefeuille robuust voor dit scenario.
  return "Geen voorbereiding nodig — portefeuille is robuust onder dit scenario.";
}

function deriveTone(impactPct: number): DashboardScenarioTone {
  if (impactPct <= -0.05) return "negative";
  if (impactPct >= 0.02) return "positive";
  return "neutral";
}

function deriveConfidence(s: MacroScenarioResult): number {
  // Base = 0.6; defensiveStrength schaalt 0..0.4 mee; warnings dempen.
  const base = 0.6;
  const defenseBoost = Math.max(0, Math.min(0.4, s.defensiveStrength / 250));
  const warningPenalty = Math.min(0.3, s.warnings.length * 0.1);
  const score = base + defenseBoost - warningPenalty;
  if (!Number.isFinite(score)) return 0.5;
  return Math.max(0, Math.min(1, score));
}

function isIndicative(s: MacroScenarioResult): boolean {
  return s.warnings.length > 0;
}

// ============================================================
//  Helpers (pure)
// ============================================================

function round0(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10_000) / 10_000;
}
