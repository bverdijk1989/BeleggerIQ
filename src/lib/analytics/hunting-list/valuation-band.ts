import type { FundamentalsSnapshot } from "@/types/factor";

import { computeExpiresAt } from "./expiry";
import {
  DEFAULT_VALUATION_SIGNAL_TTL_DAYS,
  type HuntingAlertSeverity,
  type HuntingTrigger,
} from "./types";

/**
 * valuation-band detector.
 *
 * Triggert wanneer de huidige fundamentals de gebruiker-gedefinieerde
 * drempels doorbreken. Twee mogelijke drempels:
 *   - `valuationMaxPE`: P/E moet ≤ drempel zijn.
 *   - `valuationMinFcfYield`: FCF-yield (fractie) ≥ drempel.
 *
 * Severity schaal:
 *   - HIGH: beide drempels geconfigureerd én beide doorbroken.
 *   - MEDIUM: één van beide ruim doorbroken (≥ 10% verder dan drempel)
 *     of beide precies op drempel.
 *   - LOW: precies op de drempel van één criterium.
 *
 * Retourneert `null` wanneer:
 *   - Geen enkele drempel is geconfigureerd.
 *   - Fundamentals ontbreken en geen enkele drempel kan worden
 *     geëvalueerd.
 *   - Alle geconfigureerde drempels NIET doorbroken zijn.
 */

export interface DetectValuationBandInput {
  fundamentals: FundamentalsSnapshot | null;
  valuationMaxPE: number | null;
  valuationMinFcfYield: number | null;
  price?: number | null;
  now?: string;
  ttlDays?: number;
}

export function detectValuationBand(
  input: DetectValuationBandInput,
): HuntingTrigger | null {
  const maxPE = positive(input.valuationMaxPE);
  const minFcf = finite(input.valuationMinFcfYield);

  if (maxPE === null && minFcf === null) return null;

  const pe = positive(input.fundamentals?.pe);
  const fcfYield = finite(input.fundamentals?.fcfYield);

  const peEvaluated = maxPE !== null && pe !== null;
  const fcfEvaluated = minFcf !== null && fcfYield !== null;
  if (!peEvaluated && !fcfEvaluated) return null;

  const peHit = peEvaluated && pe! <= maxPE!;
  const fcfHit = fcfEvaluated && fcfYield! >= minFcf!;

  if (!peHit && !fcfHit) return null;

  // Severity-bepaling (pure regels, documenteerbaar).
  let severity: HuntingAlertSeverity = "LOW";
  const configuredBoth = maxPE !== null && minFcf !== null;
  if (configuredBoth && peHit && fcfHit) {
    severity = "HIGH";
  } else if (
    (peHit && maxPE !== null && pe !== null && pe <= maxPE * 0.9) ||
    (fcfHit && minFcf !== null && fcfYield !== null && fcfYield >= minFcf * 1.1)
  ) {
    severity = "MEDIUM";
  }

  const rationale: string[] = [];
  if (peHit) {
    rationale.push(
      `P/E ${formatRatio(pe!)} ligt op of onder drempel ${formatRatio(maxPE!)}.`,
    );
  }
  if (fcfHit) {
    rationale.push(
      `FCF-yield ${formatPctValue(fcfYield!)} ligt op of boven drempel ${formatPctValue(minFcf!)}.`,
    );
  }
  if (peEvaluated && !peHit) {
    rationale.push(
      `P/E ${formatRatio(pe!)} nog boven drempel ${formatRatio(maxPE!)} — half-signaal.`,
    );
  }
  if (fcfEvaluated && !fcfHit) {
    rationale.push(
      `FCF-yield ${formatPctValue(fcfYield!)} nog onder drempel ${formatPctValue(minFcf!)} — half-signaal.`,
    );
  }

  const firedAt = input.now ?? new Date().toISOString();
  const ttlDays = input.ttlDays ?? DEFAULT_VALUATION_SIGNAL_TTL_DAYS;

  return {
    type: "valuation-band-reached",
    severity,
    rationale,
    riskNote:
      "Lage ratio's kunnen structurele winstdaling reflecteren (value trap). Valideer de operationele kerncijfers (marges, cash flow, schuld) en recente guidance voordat je de goedkope waardering als buy-trigger interpreteert.",
    firedAt,
    expiresAt: computeExpiresAt(firedAt, ttlDays),
    snapshot: {
      price: finite(input.price),
      pe,
      fcfYield,
    },
  };
}

// ============================================================
//  Helpers
// ============================================================

function positive(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return value > 0 ? value : null;
}

function finite(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function formatRatio(value: number): string {
  return value.toFixed(1);
}

function formatPctValue(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
