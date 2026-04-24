import type {
  RebalanceAction,
  RebalanceActionLabel,
  RebalanceQuantityConfidence,
  RebalanceQuantityPlan,
} from "@/types/rebalance";

/**
 * Rebalance quantity engine.
 *
 * Pure functie die een positie + target-weight omzet in een concrete
 * afbouwaanbeveling: hoeveel stuks verkopen, voor welk bedrag, en wat
 * is dan het nieuwe gewicht?
 *
 * Design-principes:
 *  - **Reproduceerbaar**: zelfde input → zelfde output. Geen random,
 *    geen externe calls.
 *  - **Geen verzonnen data**: wanneer een koers ontbreekt retourneren
 *    we `sharesToSell = 0`, `currentPrice = null` en een expliciete
 *    warning. Nooit een gok.
 *  - **Veilig floor-en**: integer shares standaard (DEGIRO/IBKR default);
 *    fractional shares alleen wanneer de caller dat expliciet toestaat.
 *  - **Niet-negatief**: `sharesToSell` is altijd ≥ 0. Een negatieve
 *    excess (positie onder target) zou een koop betekenen — dat valt
 *    buiten de scope van deze *rebalance/trim*-engine. Callers die een
 *    koop willen plannen gebruiken de allocation-engine.
 *
 * Input:
 *   - `currentValue`: huidige waarde in base currency (marketValueBase).
 *   - `currentPrice`: unit-prijs in base currency. `null`/`undefined` →
 *     graceful degrade met warning.
 *   - `totalPortfolioValue`: denominator voor de weight-berekening.
 *   - `targetWeight`: fractie (0..1). Komt typisch uit de policy-engine
 *     (voor ETFs uit instrument-type cap, voor single stocks uit user
 *     policy), of uit de existing rebalance-engine output.
 *   - `action`: enum uit de rebalance-engine. Wordt gemapt naar NL label.
 *   - `allowFractionalShares`: optioneel, default `false`.
 *
 * Formules (exact):
 *   excessValue = max(0, currentValue - targetWeight × totalPortfolioValue)
 *   sharesToSell = floor(excessValue / currentPrice)    // of round(4) als fractional
 *   amountToSell = sharesToSell × currentPrice
 *   postSellWeight = ((currentValue - amountToSell) / totalPortfolioValue) × 100
 */

export interface ComputeRebalanceQuantityInput {
  symbol: string;
  action: RebalanceAction;
  currentValue: number;
  /** `null`/`undefined` triggert de "onvoldoende koersdata"-fallback. */
  currentPrice?: number | null;
  /** Laatst bekende koers als de live-koers ontbreekt. Optioneel. */
  lastKnownPrice?: number | null;
  totalPortfolioValue: number;
  /** Fractie 0..1. Komt uit policy-engine of rebalance-engine. */
  targetWeight: number;
  /** Standaard integer shares. Fractional voor fractional-brokers. */
  allowFractionalShares?: boolean;
  /** Classifier-confidence uit enrichment, 0..1. Beïnvloedt output-confidence. */
  classifierConfidence?: number | null;
}

export function computeRebalanceQuantity(
  input: ComputeRebalanceQuantityInput,
): RebalanceQuantityPlan {
  const warnings: string[] = [];

  const totalPortfolioValue = sanitizeNumber(input.totalPortfolioValue);
  const currentValue = sanitizeNumber(input.currentValue);
  const targetWeightFraction = clampFraction(input.targetWeight);

  // Prefer live koers; val terug op laatst bekende koers; anders null.
  let currentPrice: number | null =
    sanitizePositive(input.currentPrice) ??
    sanitizePositive(input.lastKnownPrice) ??
    null;
  if (input.currentPrice == null && input.lastKnownPrice != null) {
    warnings.push("Gebruikte laatst bekende koers — live koers ontbreekt.");
  }
  if (currentPrice === null) {
    warnings.push("Onvoldoende koersdata om aantal stuks te berekenen.");
  }

  // Weights als percentage (0..100) voor user-facing output.
  const currentWeightPct =
    totalPortfolioValue > 0 ? (currentValue / totalPortfolioValue) * 100 : 0;
  const targetWeightPct = targetWeightFraction * 100;

  const targetValue = targetWeightFraction * totalPortfolioValue;
  const rawExcess = currentValue - targetValue;
  // Niet-negatief: bij NO_ACTION of ondergewicht is er geen excess om af te bouwen.
  const excessValue = rawExcess > 0 ? rawExcess : 0;

  // Bereken quantity alleen wanneer er een positieve excess is EN de
  // actie daadwerkelijk om afbouw vraagt. RECONSIDER is conceptueel
  // "hele positie heroverwegen" — we projecteren volledige afbouw
  // (currentValue) als excess tenzij de caller 'm anders wenst.
  const plannedExcessValue =
    input.action === "RECONSIDER" ? currentValue : excessValue;

  let sharesToSell = 0;
  let amountToSell = 0;
  if (
    currentPrice !== null &&
    currentPrice > 0 &&
    plannedExcessValue > 0 &&
    input.action !== "NO_ACTION"
  ) {
    const rawShares = plannedExcessValue / currentPrice;
    sharesToSell = input.allowFractionalShares
      ? roundTo(rawShares, 4)
      : Math.floor(rawShares);
    if (sharesToSell < 0) sharesToSell = 0; // defensive
    amountToSell = roundTo(sharesToSell * currentPrice, 2);
  }

  const remainingValue = currentValue - amountToSell;
  const postSellWeight =
    totalPortfolioValue > 0
      ? (remainingValue / totalPortfolioValue) * 100
      : 0;

  const actionLabel = mapActionLabel(input.action);
  const reason = buildReason({
    action: input.action,
    actionLabel,
    sharesToSell,
    currentPrice,
    targetWeightPct,
    allowFractional: Boolean(input.allowFractionalShares),
  });
  const confidence = determineConfidence({
    hasPrice: currentPrice !== null,
    usedLastKnown: input.currentPrice == null && input.lastKnownPrice != null,
    classifierConfidence: input.classifierConfidence ?? null,
  });

  return {
    symbol: input.symbol,
    actionLabel,
    currentWeight: roundTo(currentWeightPct, 2),
    targetWeight: roundTo(targetWeightPct, 2),
    currentValue: roundTo(currentValue, 2),
    targetValue: roundTo(targetValue, 2),
    excessValue: roundTo(excessValue, 2),
    currentPrice: currentPrice === null ? null : roundTo(currentPrice, 4),
    sharesToSell,
    amountToSell,
    postSellWeight: roundTo(postSellWeight, 2),
    reason,
    confidence,
    warnings,
  };
}

// ============================================================
//  Action-label mapping
// ============================================================

function mapActionLabel(action: RebalanceAction): RebalanceActionLabel {
  switch (action) {
    case "NO_ACTION":
      return "geen actie";
    case "TRIM_LIGHT":
      return "licht afbouwen";
    case "TRIM_HEAVY":
      return "stevig afbouwen";
    case "RECONSIDER":
      return "heroverwegen";
  }
}

// ============================================================
//  Reason-builder (pure presentatie)
// ============================================================

interface ReasonContext {
  action: RebalanceAction;
  actionLabel: RebalanceActionLabel;
  sharesToSell: number;
  currentPrice: number | null;
  targetWeightPct: number;
  allowFractional: boolean;
}

function buildReason(ctx: ReasonContext): string {
  if (ctx.action === "NO_ACTION") {
    return "Positie binnen target-cap — geen verkoop nodig.";
  }
  if (ctx.currentPrice === null) {
    return `${capitalize(ctx.actionLabel)} geadviseerd, maar aantal stuks niet te bepalen zonder koersdata.`;
  }
  if (ctx.sharesToSell === 0) {
    return `${capitalize(ctx.actionLabel)} geadviseerd, maar de overschrijding is kleiner dan één aandeel bij de huidige koers.`;
  }
  const unit = ctx.allowFractional ? "stuks" : ctx.sharesToSell === 1 ? "aandeel" : "aandelen";
  const target = `${ctx.targetWeightPct.toFixed(0)}%`;
  if (ctx.action === "RECONSIDER") {
    return `Boven policy-cap van ${target}; heroverweeg: verkoop ${ctx.sharesToSell} ${unit} om de positie volledig af te bouwen.`;
  }
  const verbalize =
    ctx.action === "TRIM_LIGHT"
      ? "om dichter bij target te komen"
      : "om terug binnen de policy-cap te komen";
  return `Boven policy-cap van ${target}; verkoop ${ctx.sharesToSell} ${unit} ${verbalize}.`;
}

// ============================================================
//  Confidence bepaling
// ============================================================

interface ConfidenceInput {
  hasPrice: boolean;
  usedLastKnown: boolean;
  classifierConfidence: number | null;
}

function determineConfidence(ctx: ConfidenceInput): RebalanceQuantityConfidence {
  if (!ctx.hasPrice) return "LOW";
  if (
    ctx.usedLastKnown ||
    (typeof ctx.classifierConfidence === "number" &&
      ctx.classifierConfidence < 0.5)
  ) {
    return "MEDIUM";
  }
  return "HIGH";
}

// ============================================================
//  Helpers (pure)
// ============================================================

function sanitizeNumber(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  return value;
}

function sanitizePositive(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function clampFraction(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}
