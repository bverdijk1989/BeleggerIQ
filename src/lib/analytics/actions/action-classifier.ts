import type { FactorScore } from "@/types/factor";
import type { MarketRegimeScore } from "@/types/regime";
import type { PolicySettings } from "@/types/profile";
import type { PositionRiskAnalysis } from "@/types/risk";

import type {
  ActionDecision,
  ActionSource,
  ActionUrgency,
} from "./types";

/**
 * Action-classifier — pure beslisregels voor één positie.
 *
 * Beslis-volgorde (eerste match wint, deterministisch):
 *
 *   1. **SELL**  — kwaliteit kelder + gewicht > policy-cap × 1.2
 *                  OF risk-flag "high"/"critical" voor deze positie
 *                  OF composite < 25 (zwak profiel)
 *   2. **TRIM**  — gewicht boven policy-cap (anti-concentratie),
 *                  of zwakke factor + boven target,
 *                  of risk-flag "elevated"
 *   3. **BUY**   — composite ≥ 70 + voldoende confidence
 *                  + ruimte onder cap + cash beschikbaar
 *                  + niet-defensief regime (of cash buffer)
 *   4. **HOLD**  — score in midden + binnen target-range
 *   5. **DO_NOTHING** — geen factor-data, geen risico-flag, geen
 *                  policy-overschrijding (= echt niets te doen).
 *
 * Drempels staan als constants bovenaan zodat de regels reproduceerbaar
 * blijven en in tests gepind kunnen worden.
 */

// ============================================================
//  Drempels (bewust conservatief)
// ============================================================

export const DECISION_THRESHOLDS = {
  /** Composite ≥ deze drempel triggert BUY-pad. */
  buyComposite: 70,
  /** Composite ≤ deze drempel = SELL-pad (zonder weight-check). */
  sellComposite: 25,
  /** Composite ≤ deze drempel = TRIM-pad bij gewicht boven target. */
  trimComposite: 45,
  /** Confidence van factor-score onder deze drempel = WATCH-mode. */
  minFactorConfidence: 0.4,
  /** Default cap per positie wanneer policy ontbreekt (fractie). */
  defaultMaxPositionWeight: 0.1,
  /** Multiplicator op cap voor SELL-trigger (boven cap × 1.2 = SELL). */
  sellWeightMultiplier: 1.2,
  /** Min-verschil current vs target voor TRIM (relatief, fractie). */
  trimWeightOvershoot: 1.05,
  // ─────────────────────────────────────────────────────────────
  // Winner-protection (Buffett-laag).
  //
  // "Let your winners run." Een hoge-kwaliteit positie die boven de
  // cap is gegroeid moet **niet** geforceerd verkocht worden puur op
  // basis van gewicht. Risk-flags blijven wél SELL triggeren —
  // bescherming geldt alleen tegen pure concentratie-SELL zonder
  // andere alarmsignalen.
  // ─────────────────────────────────────────────────────────────
  /** Composite ≥ deze drempel = "winner"; concentratie-only SELL → TRIM. */
  winnerProtectComposite: 70,
  /** Quality sub-score ≥ deze drempel = "compounder"-kwaliteit. */
  winnerProtectQuality: 70,
} as const;

// ============================================================
//  Input + return
// ============================================================

export interface ClassifyActionInput {
  ticker: string;
  composite: number | null;
  factorConfidence: number | null;
  qualitySubScore: number | null;
  currentWeight: number;
  targetWeight: number | null;
  policy?: PolicySettings | null;
  positionRisk?: PositionRiskAnalysis | null;
  /** True wanneer rebalance-engine al een TRIM_HEAVY/RECONSIDER aanbeveelt. */
  rebalanceForcesTrim?: boolean;
  rebalanceForcesReconsider?: boolean;
  cashAvailable: number;
  marketValueBase: number;
  /** Marktregime — DEFENSIVE remt BUY, NEUTRAL/RISK_ON kan BUY versterken. */
  regime?: MarketRegimeScore | null;
  /**
   * Type-bewuste positie-cap uit de policy-engine. Wanneer aanwezig krijgt
   * deze voorrang op `policy.maxPositionWeight` — zo krijgt een
   * BROAD_MARKET_ETF 60% en een SINGLE_STOCK 10% bij dezelfde policy.
   */
  instrumentLimit?: { allowedMaxWeight: number; runMultiplier: number } | null;
}

export interface ClassifyActionResult {
  action: ActionDecision;
  urgency: ActionUrgency;
  rationaleParts: string[];
  riskImpact: string;
  sources: ActionSource[];
  confidence: number;
}

// ============================================================
//  Public function
// ============================================================

export function classifyAction(
  input: ClassifyActionInput,
): ClassifyActionResult {
  const cap = resolveCap(input.policy, input.instrumentLimit);
  const composite = input.composite;
  const conf = input.factorConfidence ?? null;

  // ----- 1. SELL pad -----
  const sellHit = decideSell(input, cap);
  if (sellHit) return sellHit;

  // ----- 2. TRIM pad -----
  const trimHit = decideTrim(input, cap);
  if (trimHit) return trimHit;

  // ----- 3. BUY pad -----
  const buyHit = decideBuy(input);
  if (buyHit) return buyHit;

  // ----- 4. HOLD vs DO_NOTHING -----
  if (composite === null && (conf ?? 0) < DECISION_THRESHOLDS.minFactorConfidence) {
    return {
      action: "DO_NOTHING",
      urgency: "LOW",
      rationaleParts: [
        "Onvoldoende factor-data om een onderbouwde aanbeveling te doen.",
      ],
      riskImpact: "Geen wijziging in portfolio-risico.",
      sources: ["factor-engine"],
      confidence: 0.3,
    };
  }

  return {
    action: "HOLD",
    urgency: "LOW",
    rationaleParts: [
      composite !== null
        ? `Composite ${Math.round(composite)}/100 ondersteunt het huidige profiel.`
        : "Geen sterke trigger om iets te wijzigen.",
    ],
    riskImpact: "Geen wijziging in portfolio-risico.",
    sources: composite !== null ? ["factor-engine"] : [],
    confidence: composite !== null ? clamp01(0.5 + (conf ?? 0) * 0.3) : 0.4,
  };
}

// ============================================================
//  Beslisregels per pad
// ============================================================

function decideSell(
  input: ClassifyActionInput,
  cap: number,
): ClassifyActionResult | null {
  const sources: ActionSource[] = [];
  const rationaleParts: string[] = [];

  // Risk-engine flag elevated/high/critical?
  const riskFlag = input.positionRisk?.riskClass;
  const riskCritical = riskFlag === "high" || riskFlag === "critical";

  // Factor zwak + duidelijk boven cap?
  const composite = input.composite;
  const sellOnFactor =
    composite !== null && composite <= DECISION_THRESHOLDS.sellComposite;
  const sellOnConcentration =
    input.currentWeight > cap * DECISION_THRESHOLDS.sellWeightMultiplier;

  // Winner-protection: een sterke positie die alleen door gewicht
  // boven cap×1.2 komt mag NIET als SELL worden gevlagd. Buffett-laag —
  // hoge composite + hoge quality + geen risk-flag → laat de winnaar
  // doorlopen, val terug op TRIM-pad voor gradueel afbouwen.
  const isWinner =
    composite !== null &&
    composite >= DECISION_THRESHOLDS.winnerProtectComposite &&
    (input.qualitySubScore ?? 0) >= DECISION_THRESHOLDS.winnerProtectQuality;
  const concentrationOnlyTrigger =
    sellOnConcentration &&
    !sellOnFactor &&
    !riskCritical &&
    !input.rebalanceForcesReconsider;
  if (concentrationOnlyTrigger && isWinner) {
    // Doorvallen naar TRIM-pad. Geen SELL.
    return null;
  }

  // Rebalance forceert RECONSIDER (= volledige afbouw plannen)?
  if (input.rebalanceForcesReconsider) {
    rationaleParts.push(
      "Rebalance-engine markeert deze positie als 'heroverwegen' — overweeg volledig afbouwen.",
    );
    sources.push("rebalance-engine");
  }
  if (sellOnFactor) {
    rationaleParts.push(
      `Composite ${Math.round(composite!)}/100 ligt onder de SELL-drempel (${DECISION_THRESHOLDS.sellComposite}).`,
    );
    sources.push("factor-engine");
  }
  if (sellOnConcentration) {
    rationaleParts.push(
      `Positie ${pct(input.currentWeight)} weegt fors boven de policy-cap van ${pct(cap)} × ${DECISION_THRESHOLDS.sellWeightMultiplier}.`,
    );
    sources.push("policy-engine");
  }
  if (riskCritical) {
    rationaleParts.push(
      `Risk-engine markeert positie als ${riskFlag} — afbouwen verlaagt portfolio-risico.`,
    );
    sources.push("risk-engine");
  }

  if (rationaleParts.length === 0) return null;

  return {
    action: "SELL",
    urgency: "HIGH",
    rationaleParts,
    riskImpact:
      "Verlaagt portfolio-concentratie en exposure naar deze specifieke risk-driver.",
    sources: dedupe(sources),
    confidence: 0.8,
  };
}

function decideTrim(
  input: ClassifyActionInput,
  cap: number,
): ClassifyActionResult | null {
  const composite = input.composite;
  const target = input.targetWeight;
  const sources: ActionSource[] = [];
  const rationaleParts: string[] = [];

  // Boven cap (anti-concentratie)? Run-multiplier respecteren: voor
  // BROAD_MARKET_ETF (cap 60%, runMultiplier 1.10) trim-trigger pas
  // bij 66%; voor SINGLE_STOCK (cap 10%, runMultiplier 2.00) pas bij
  // 20% (Buffett-laag "let winners run").
  const trimRunMultiplier = input.instrumentLimit?.runMultiplier ?? 1.0;
  const trimTrigger = cap * trimRunMultiplier;
  const aboveCap = input.currentWeight > trimTrigger;
  // Boven target × overshoot-factor + zwakke factor?
  const aboveTarget =
    target !== null &&
    target > 0 &&
    input.currentWeight > target * DECISION_THRESHOLDS.trimWeightOvershoot;
  const weakFactor =
    composite !== null && composite <= DECISION_THRESHOLDS.trimComposite;
  const elevatedRisk = input.positionRisk?.riskClass === "elevated";

  // Detecteer winner-protection: positie die anders SELL had gekregen
  // op concentratie maar door composite + quality is "doorgevallen".
  // Markeer dit expliciet zodat de UI het label "let your winners run"
  // kan tonen i.p.v. een dreigend "afbouwen".
  const isWinner =
    composite !== null &&
    composite >= DECISION_THRESHOLDS.winnerProtectComposite &&
    (input.qualitySubScore ?? 0) >= DECISION_THRESHOLDS.winnerProtectQuality;
  const concentrationOnly =
    aboveCap &&
    !weakFactor &&
    !elevatedRisk &&
    !input.rebalanceForcesTrim;
  const isWinnerTrim = concentrationOnly && isWinner;

  if (input.rebalanceForcesTrim) {
    rationaleParts.push(
      "Rebalance-engine adviseert afbouwen — gewicht ligt boven beleidsdrempel.",
    );
    sources.push("rebalance-engine");
  }
  if (aboveCap) {
    rationaleParts.push(
      isWinnerTrim
        ? `Sterke positie boven de policy-cap (${pct(input.currentWeight)} > ${pct(cap)}). Niet verkopen — gradueel terug naar cap zodat de winnaar mag doorlopen.`
        : `Positie ${pct(input.currentWeight)} ligt boven de policy-cap (${pct(cap)}).`,
    );
    sources.push("policy-engine");
  }
  if (aboveTarget && weakFactor) {
    rationaleParts.push(
      `Gewicht ${pct(input.currentWeight)} ruim boven target ${pct(target!)} en composite ${Math.round(composite!)}/100 is zwak.`,
    );
    sources.push("factor-engine");
  }
  if (elevatedRisk) {
    rationaleParts.push("Risk-engine flag 'elevated' op deze positie.");
    sources.push("risk-engine");
  }

  if (rationaleParts.length === 0) return null;

  // Winner-trim is bewust LOW-urgency: het is een opportuniteit voor
  // gradueel risicomanagement, geen alarmsignaal.
  const urgency: ActionUrgency = isWinnerTrim
    ? "LOW"
    : aboveCap || elevatedRisk
      ? "MEDIUM"
      : "LOW";

  return {
    action: "TRIM",
    urgency,
    rationaleParts,
    riskImpact: isWinnerTrim
      ? "Beschermt winst gradueel zonder kwaliteitspositie kwijt te raken."
      : "Verlaagt single-name concentratie; vrijgekomen cash kan herbelegd worden.",
    sources: dedupe(sources),
    confidence: 0.7,
  };
}

function decideBuy(
  input: ClassifyActionInput,
): ClassifyActionResult | null {
  const composite = input.composite;
  const conf = input.factorConfidence ?? 0;
  const cap = resolveCap(input.policy, input.instrumentLimit);

  if (composite === null) return null;
  if (composite < DECISION_THRESHOLDS.buyComposite) return null;
  if (conf < DECISION_THRESHOLDS.minFactorConfidence) return null;
  if (input.currentWeight >= cap) return null; // geen ruimte
  if (input.cashAvailable <= 0) return null;

  // Defensief regime = LOW urgency BUY (alleen wanneer composite ≥ 80)
  const stance = input.regime?.stance ?? null;
  const isDefensive = stance === "DEFENSIVE";
  if (isDefensive && composite < 80) return null;

  const sources: ActionSource[] = ["factor-engine"];
  if (stance) sources.push("market-regime");

  const urgency: ActionUrgency =
    composite >= 80 && conf >= 0.7
      ? isDefensive
        ? "LOW"
        : "MEDIUM"
      : "LOW";

  const rationaleParts: string[] = [
    `Composite ${Math.round(composite)}/100 met ${pct(conf)} confidence ondersteunt bijkopen.`,
  ];
  if (input.targetWeight !== null && input.targetWeight > input.currentWeight) {
    rationaleParts.push(
      `Huidig gewicht ${pct(input.currentWeight)} ligt onder target ${pct(input.targetWeight)} — ruimte om bij te kopen.`,
    );
  }
  if (stance) {
    rationaleParts.push(`Marktregime is ${stance.toLowerCase()}.`);
  }

  return {
    action: "BUY",
    urgency,
    rationaleParts,
    riskImpact:
      "Verhoogt exposure met een bovengemiddeld factor-profiel; mits binnen position-cap.",
    sources,
    confidence: clamp01(0.55 + conf * 0.35),
  };
}

// ============================================================
//  Helpers
// ============================================================

/**
 * Cap-resolver. Wanneer `instrumentLimit` aanwezig is gebruiken we de
 * type-bewuste cap uit de policy-engine (BROAD_MARKET_ETF 60%, SINGLE_STOCK
 * 10%, …). Anders fallback op `policy.maxPositionWeight` (legacy) of de
 * conservatieve default 10%.
 *
 * Wordt zo nieuwe canonical entry-point: alle action-engine paden
 * (decideSell, decideTrim, decideBuy) gaan via deze functie.
 */
export function resolveCap(
  policy?: PolicySettings | null,
  instrumentLimit?: { allowedMaxWeight: number } | null,
): number {
  // Type-bewuste cap heeft voorrang — anders blijft een 30% Vanguard
  // S&P 500 een SELL-trigger krijgen tegen de 10%-default.
  if (instrumentLimit && Number.isFinite(instrumentLimit.allowedMaxWeight)) {
    return instrumentLimit.allowedMaxWeight;
  }
  const fromPolicy = policy?.maxPositionWeight;
  if (typeof fromPolicy === "number" && fromPolicy > 0 && fromPolicy <= 1) {
    return fromPolicy;
  }
  return DECISION_THRESHOLDS.defaultMaxPositionWeight;
}

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

function dedupe<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// Re-exports voor de orchestrator
export type { FactorScore, MarketRegimeScore };
