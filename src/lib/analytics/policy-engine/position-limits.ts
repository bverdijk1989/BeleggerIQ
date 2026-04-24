import type { InstrumentClassification } from "@/lib/analytics/instruments";

import type { InstrumentRiskAssessment } from "./classify-risk";
import {
  DEFAULT_LIMITS_BY_TYPE,
  RISK_ADJUSTMENT_MULTIPLIER,
  type PolicyContext,
  type PositionLimit,
} from "./types";

/**
 * Bepaal de `allowedMaxWeight` voor een positie op basis van:
 *   - instrument-type (default cap uit `DEFAULT_LIMITS_BY_TYPE`)
 *   - user policy overrides (per-type + globale tightening)
 *   - risk-level multiplier (HIGH/ELEVATED → strengere cap)
 *   - user's `maxPositionWeight` (alleen hard cap op SINGLE_STOCK)
 *
 * Retourneert altijd een waarde + uitlegbare reden. Als de cap `null`
 * zou zijn (cash) retourneert de functie `Infinity` zodat downstream
 * berekeningen (excessWeight) nooit NaN produceren.
 *
 * Design-regel: de meest-restrictieve cap wint. De user kan via policy
 * wel *strenger* worden dan de defaults, niet *losser* — dat voorkomt
 * dat een naïeve override per ongeluk concentration-risico verstopt.
 */

export interface ResolveLimitInput {
  classification: InstrumentClassification;
  risk: InstrumentRiskAssessment;
  context?: PolicyContext;
}

export function resolvePositionLimitByAssetType(
  input: ResolveLimitInput,
): PositionLimit {
  const { classification, risk, context = {} } = input;
  const { instrumentType } = classification;

  // 1) Start met default cap voor dit instrument-type.
  const defaultCap = DEFAULT_LIMITS_BY_TYPE[instrumentType];
  if (defaultCap === null) {
    // Cash: geen cap. Returnen als +∞ zodat downstream vergelijkingen
    // natuurlijk uitkomen (currentWeight < Infinity is altijd true).
    return {
      allowedMaxWeight: Number.POSITIVE_INFINITY,
      basis: "default",
      reason: `${humanize(instrumentType)} — geen positie-cap.`,
    };
  }

  let cap = defaultCap;
  let basis: PositionLimit["basis"] = "default";
  const reasonParts: string[] = [
    `${humanize(instrumentType)} — default cap ${pct(defaultCap)}`,
  ];

  // 2) Per-type override uit PolicyContext wint over default (mag hoger/lager).
  const override = context.overrides?.limitsByType?.[instrumentType];
  if (override === null) {
    // Expliciete null = cap uitzetten. Return infinity; user neemt bewust risico.
    return {
      allowedMaxWeight: Number.POSITIVE_INFINITY,
      basis: "user-override",
      reason: `${humanize(instrumentType)} — policy-override heft de cap op.`,
    };
  }
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    cap = override;
    basis = "user-override";
    reasonParts.push(`Policy-override naar ${pct(override)}`);
  }

  // 3) Globale tightening (bv. CAPITAL_PRESERVATION objective → 0.8×).
  const tightening = context.overrides?.globalTightening;
  if (
    typeof tightening === "number" &&
    Number.isFinite(tightening) &&
    tightening > 0 &&
    tightening !== 1
  ) {
    cap = cap * tightening;
    basis = "user-policy";
    reasonParts.push(`Globale tightening ×${tightening.toFixed(2)}`);
  }

  // 4) Risk-adjustment. Halveert cap bij HIGH, 0.75× bij ELEVATED.
  const riskMultiplier = RISK_ADJUSTMENT_MULTIPLIER[risk.level];
  if (riskMultiplier !== 1) {
    cap = cap * riskMultiplier;
    basis = "risk-adjusted";
    reasonParts.push(
      `Risk-adjustment (${risk.level.toLowerCase()}) ×${riskMultiplier}`,
    );
  }

  // 5) `userMaxSinglePositionWeight` is een hard-cap op SINGLE_STOCK.
  //    We respecteren 'm alleen als 'ie LAGER is dan wat we nu hebben.
  if (
    instrumentType === "SINGLE_STOCK" &&
    typeof context.userMaxSinglePositionWeight === "number" &&
    Number.isFinite(context.userMaxSinglePositionWeight) &&
    context.userMaxSinglePositionWeight > 0 &&
    context.userMaxSinglePositionWeight < cap
  ) {
    cap = context.userMaxSinglePositionWeight;
    basis = "user-policy";
    reasonParts.push(
      `User policy single-stock cap = ${pct(context.userMaxSinglePositionWeight)}`,
    );
  }

  return {
    allowedMaxWeight: roundTo4(cap),
    basis,
    reason: reasonParts.join(" → "),
  };
}

// ============================================================
//  Helpers (puur presentatie; geen businesslogica)
// ============================================================

function humanize(instrumentType: string): string {
  // "BROAD_MARKET_ETF" → "Broad market ETF"
  return instrumentType
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function roundTo4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
