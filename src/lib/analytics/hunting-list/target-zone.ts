import { computeExpiresAt } from "./expiry";
import {
  DEFAULT_BUY_ZONE_TOLERANCE,
  DEFAULT_TARGET_SIGNAL_TTL_DAYS,
  type HuntingAlertSeverity,
  type HuntingTrigger,
} from "./types";

/**
 * target-zone detector.
 *
 * Drie logische zones op basis van config + huidige koers:
 *
 *   1. **target-zone-reached (HIGH)** — prijs ligt op of onder
 *      `targetPrice`, of (indien een band is gedefinieerd) ligt binnen
 *      `[targetPrice, targetPriceHigh]`.
 *   2. **target-zone-reached (MEDIUM)** — prijs ligt net boven de band
 *      maar binnen de `buyZoneTolerance × targetPriceHigh` marge.
 *   3. **target-zone-near (LOW)** — prijs ligt tussen target en
 *      `targetPrice × (1 + buyZoneTolerance)` en er is geen expliciete
 *      band geconfigureerd.
 *
 * Wanneer config ontbreekt (geen targetPrice), retourneert de detector
 * `null`. Wanneer er geen quote is, retourneert hij ook `null` zodat
 * de caller `dataQuality.hasQuote = false` kan flaggen op item-niveau.
 */

export interface DetectTargetZoneInput {
  currentPrice: number | null;
  targetPrice: number | null;
  targetPriceHigh: number | null;
  buyZoneTolerance: number;
  now?: string;
  ttlDays?: number;
  pe?: number | null;
  fcfYield?: number | null;
}

export function detectTargetZone(
  input: DetectTargetZoneInput,
): HuntingTrigger | null {
  const price = positive(input.currentPrice);
  const target = positive(input.targetPrice);
  if (price === null || target === null) return null;

  const tolerance =
    Number.isFinite(input.buyZoneTolerance) && input.buyZoneTolerance > 0
      ? input.buyZoneTolerance
      : DEFAULT_BUY_ZONE_TOLERANCE;
  const firedAt = input.now ?? new Date().toISOString();
  const ttlDays = input.ttlDays ?? DEFAULT_TARGET_SIGNAL_TTL_DAYS;
  const highBand = positive(input.targetPriceHigh);

  // --- Case A: expliciete band (targetPrice … targetPriceHigh) ---
  if (highBand !== null && highBand >= target) {
    if (price >= target && price <= highBand) {
      return build({
        firedAt,
        ttlDays,
        severity: "HIGH",
        rationale: [
          `Koers ${formatNumber(price)} ligt binnen de target-zone [${formatNumber(target)}, ${formatNumber(highBand)}].`,
        ],
        price,
        pe: input.pe ?? null,
        fcfYield: input.fcfYield ?? null,
      });
    }
    if (price < target) {
      // Onder de band = ook een buy-zone treffer.
      return build({
        firedAt,
        ttlDays,
        severity: "HIGH",
        rationale: [
          `Koers ${formatNumber(price)} ligt onder de targetzone-ondergrens (${formatNumber(target)}).`,
        ],
        price,
        pe: input.pe ?? null,
        fcfYield: input.fcfYield ?? null,
      });
    }
    // Net boven `highBand` maar binnen tolerance?
    const upperNear = highBand * (1 + tolerance);
    if (price <= upperNear) {
      return build({
        firedAt,
        ttlDays,
        severity: "MEDIUM",
        rationale: [
          `Koers ${formatNumber(price)} ligt ${formatPct(price / highBand - 1)} boven bovenzijde band (${formatNumber(highBand)}), binnen tolerantie van ${formatPct(tolerance)}.`,
        ],
        price,
        pe: input.pe ?? null,
        fcfYield: input.fcfYield ?? null,
      });
    }
    return null; // te ver boven de band → watching
  }

  // --- Case B: enkele target → punt + tolerantie-marge ---
  if (price <= target) {
    return build({
      firedAt,
      ttlDays,
      severity: "HIGH",
      rationale: [
        `Koers ${formatNumber(price)} ligt op of onder target (${formatNumber(target)}).`,
      ],
      price,
      pe: input.pe ?? null,
      fcfYield: input.fcfYield ?? null,
    });
  }

  const nearUpper = target * (1 + tolerance);
  if (price <= nearUpper) {
    return build({
      type: "target-zone-near",
      firedAt,
      ttlDays,
      severity: "LOW",
      rationale: [
        `Koers ${formatNumber(price)} ligt ${formatPct(price / target - 1)} boven target (${formatNumber(target)}), binnen buy-zone-tolerantie ${formatPct(tolerance)}.`,
      ],
      price,
      pe: input.pe ?? null,
      fcfYield: input.fcfYield ?? null,
    });
  }

  return null;
}

// ============================================================
//  Helpers
// ============================================================

function build(params: {
  type?: "target-zone-reached" | "target-zone-near";
  firedAt: string;
  ttlDays: number;
  severity: HuntingAlertSeverity;
  rationale: string[];
  price: number;
  pe: number | null;
  fcfYield: number | null;
}): HuntingTrigger {
  return {
    type: params.type ?? "target-zone-reached",
    severity: params.severity,
    rationale: params.rationale,
    riskNote:
      "Een target-zone-treffer is een prijsmoment — geen garantie dat de koers niet verder zakt. Controleer altijd of de aankoopcase (kwaliteit, risico, allocatie) nog klopt voordat je instapt.",
    firedAt: params.firedAt,
    expiresAt: computeExpiresAt(params.firedAt, params.ttlDays),
    snapshot: {
      price: params.price,
      pe: params.pe,
      fcfYield: params.fcfYield,
    },
  };
}

function positive(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return value > 0 ? value : null;
}

function formatNumber(value: number): string {
  return value.toFixed(2);
}

function formatPct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}
