/**
 * Crypto Risk & Momentum Lab — engine (Module 12).
 *
 * Pure orchestrator: takes user crypto-holdings + per-asset metrics →
 * produceert een `CryptoRiskReport` met allocatie-tier, sizing-warning,
 * speculation-score en expliciete waarschuwingen.
 *
 * **GEEN**: koop-/verkoop-advies. Geen leverage-promotie.
 * **WEL**: meting + waarschuwing + uitleg.
 */

import type { ISODateString } from "@/types/common";

import type {
  CryptoAllocationTier,
  CryptoAssetKey,
  CryptoAssetMetrics,
  CryptoPosition,
  CryptoRiskReport,
  CryptoSizingAssessment,
  SizingTier,
} from "./types";
import {
  CRYPTO_ASSET_LABELS,
  CRYPTO_LAB_DISCLAIMER,
} from "./types";

// ============================================================
//  Drempels (constants) — Buffett-laag: streng
// ============================================================

const ALLOCATION_TIERS: ReadonlyArray<{
  tier: CryptoAllocationTier;
  min: number;
}> = [
  { tier: "very_high", min: 0.30 },
  { tier: "high", min: 0.15 },
  { tier: "moderate", min: 0.05 },
  { tier: "small", min: 0.0001 },
  { tier: "none", min: 0 },
];

const SIZING_TIERS: ReadonlyArray<{
  tier: SizingTier;
  weightThreshold: number;
  reason: string;
}> = [
  {
    tier: "critical",
    weightThreshold: 0.30,
    reason:
      "Eén crypto-positie > 30% van je portefeuille — historisch zijn 60-80% drawdowns realistisch en deze positiegrootte raakt direct je financiële hoofdsom.",
  },
  {
    tier: "warning",
    weightThreshold: 0.15,
    reason:
      "Eén crypto-positie > 15% — een drawdown van 50% raakt 7.5%+ van je totale portefeuille. Check of dit een bewuste convictie of een drift is.",
  },
  {
    tier: "watch",
    weightThreshold: 0.05,
    reason:
      "Eén crypto-positie 5-15% — substantieel, niet onbeheersbaar. Houd het in de gaten en vergelijk met je risicoprofiel.",
  },
  {
    tier: "comfortable",
    weightThreshold: 0,
    reason:
      "Crypto-exposure is bescheiden t.o.v. je portefeuille — speculatie-impact blijft beheersbaar.",
  },
];

// Speculation-score weegt: allocatie-aandeel + volatiliteit + sample-drawdown.
const VOL_REFERENCE_HIGH = 0.80; // 80%/yr — referentie hoog
const VOL_REFERENCE_LOW = 0.40;

// ============================================================
//  Public API
// ============================================================

export interface BuildCryptoReportInput {
  asOf: ISODateString;
  totalPortfolioValue: number;
  positions: ReadonlyArray<CryptoPosition>;
  /** Per-asset metrics — caller berekent deze (zie metrics.ts). */
  assetMetrics: ReadonlyArray<CryptoAssetMetrics>;
}

export function buildCryptoRiskReport(
  input: BuildCryptoReportInput,
): CryptoRiskReport {
  const totalCryptoValue = input.positions.reduce(
    (sum, p) => sum + (Number.isFinite(p.marketValueBase) ? p.marketValueBase : 0),
    0,
  );
  const allocationFraction =
    input.totalPortfolioValue > 0
      ? totalCryptoValue / input.totalPortfolioValue
      : 0;

  const allocationTier = resolveAllocationTier(allocationFraction);
  const sizing = assessSizing(input.positions);
  const speculationScore = computeSpeculationScore({
    allocationFraction,
    assetMetrics: input.assetMetrics,
  });

  const warnings = buildWarnings({
    allocationTier,
    allocationFraction,
    sizing,
    assetMetrics: input.assetMetrics,
  });

  return {
    generatedAt: input.asOf,
    totalCryptoValue,
    allocationFraction,
    allocationTier,
    positions: [...input.positions],
    assets: [...input.assetMetrics],
    sizing,
    speculationScore,
    warnings,
    disclaimer: CRYPTO_LAB_DISCLAIMER,
  };
}

// ============================================================
//  Helpers
// ============================================================

function resolveAllocationTier(fraction: number): CryptoAllocationTier {
  for (const t of ALLOCATION_TIERS) {
    if (fraction >= t.min) return t.tier;
  }
  return "none";
}

function assessSizing(
  positions: ReadonlyArray<CryptoPosition>,
): CryptoSizingAssessment {
  if (positions.length === 0) {
    return {
      tier: "comfortable",
      threshold: 0,
      message:
        "Geen crypto-positie aanwezig — de lab toont speculation-metrics zodra je een positie toevoegt.",
    };
  }
  const largest = positions.reduce((max, p) =>
    p.weight > max.weight ? p : max,
  );
  for (const t of SIZING_TIERS) {
    if (largest.weight >= t.weightThreshold) {
      return {
        tier: t.tier,
        threshold: t.weightThreshold,
        message: `${largest.ticker} weegt ${(largest.weight * 100).toFixed(1)}% — ${t.reason}`,
      };
    }
  }
  return {
    tier: "comfortable",
    threshold: 0,
    message: "Crypto-positiegrootte is binnen comfortabele grenzen.",
  };
}

function computeSpeculationScore(input: {
  allocationFraction: number;
  assetMetrics: ReadonlyArray<CryptoAssetMetrics>;
}): number {
  // Composite: 50% allocatie + 30% vol + 20% drawdown-recency.
  const allocComponent = scaleAllocation(input.allocationFraction);
  const volComponent = scaleVolatility(input.assetMetrics);
  const ddComponent = scaleDrawdown(input.assetMetrics);
  const composite =
    0.5 * allocComponent + 0.3 * volComponent + 0.2 * ddComponent;
  return clampInt(composite);
}

function scaleAllocation(fraction: number): number {
  // 0% → 0; 5% → 25; 15% → 60; 30% → 85; 50%+ → 95.
  if (fraction <= 0) return 0;
  if (fraction <= 0.05) return (fraction / 0.05) * 25;
  if (fraction <= 0.15) return 25 + ((fraction - 0.05) / 0.10) * 35;
  if (fraction <= 0.30) return 60 + ((fraction - 0.15) / 0.15) * 25;
  if (fraction <= 0.50) return 85 + ((fraction - 0.30) / 0.20) * 10;
  return 95;
}

function scaleVolatility(
  assetMetrics: ReadonlyArray<CryptoAssetMetrics>,
): number {
  const vols = assetMetrics
    .map((m) => m.annualizedVolatility)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (vols.length === 0) return 60; // default "verhoogd" zonder data
  const avg = vols.reduce((s, v) => s + v, 0) / vols.length;
  // 40%/yr → 30; 60%/yr → 60; 80%/yr → 90.
  if (avg <= VOL_REFERENCE_LOW) return 30;
  if (avg >= VOL_REFERENCE_HIGH) return 90;
  return 30 + ((avg - VOL_REFERENCE_LOW) / (VOL_REFERENCE_HIGH - VOL_REFERENCE_LOW)) * 60;
}

function scaleDrawdown(
  assetMetrics: ReadonlyArray<CryptoAssetMetrics>,
): number {
  const dds = assetMetrics
    .map((m) => m.maxDrawdown)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (dds.length === 0) return 60;
  const worst = Math.min(...dds);
  // -30% → 20; -60% → 60; -80%+ → 95.
  if (worst >= -0.30) return 20;
  if (worst <= -0.80) return 95;
  return 20 + ((-worst - 0.30) / 0.50) * 75;
}

function buildWarnings(input: {
  allocationTier: CryptoAllocationTier;
  allocationFraction: number;
  sizing: CryptoSizingAssessment;
  assetMetrics: ReadonlyArray<CryptoAssetMetrics>;
}): string[] {
  const out: string[] = [];

  if (input.allocationTier === "very_high") {
    out.push(
      `Crypto is ${(input.allocationFraction * 100).toFixed(1)}% van je portefeuille — historisch zijn 60-80% drawdowns realistisch. Een crash op dit niveau raakt direct je hoofdsom.`,
    );
  } else if (input.allocationTier === "high") {
    out.push(
      `Crypto-allocatie ${(input.allocationFraction * 100).toFixed(1)}% — boven wat de meeste lange-termijn-portefeuilles aanhouden (typisch 0-5%). Check of dit een bewuste keuze of een groeiende drift is.`,
    );
  }

  if (input.sizing.tier === "critical" || input.sizing.tier === "warning") {
    out.push(input.sizing.message);
  }

  for (const m of input.assetMetrics) {
    if (
      typeof m.annualizedVolatility === "number" &&
      m.annualizedVolatility >= VOL_REFERENCE_HIGH
    ) {
      out.push(
        `${CRYPTO_ASSET_LABELS[m.asset]} jaarvolatiliteit ${(m.annualizedVolatility * 100).toFixed(0)}% — een dagschommeling van 5-10% is normaal in deze klasse.`,
      );
    }
    if (typeof m.maxDrawdown === "number" && m.maxDrawdown <= -0.60) {
      out.push(
        `${CRYPTO_ASSET_LABELS[m.asset]} max-drawdown in window ${(m.maxDrawdown * 100).toFixed(0)}% — een vergelijkbare daling kan opnieuw voorkomen.`,
      );
    }
    if (m.dataQuality === "low" || m.dataQuality === "missing") {
      out.push(
        `Datakwaliteit voor ${CRYPTO_ASSET_LABELS[m.asset]} is ${m.dataQuality} (sample ${m.sampleSize}). Interpreteer metrics met onzekerheidsmarge.`,
      );
    }
  }

  // Universele speculation-disclaimer als er crypto-exposure is.
  if (input.allocationTier !== "none") {
    out.push(
      "Crypto is speculatief: BeleggerIQ promoot geen leverage, geen aankoop-trigger en geen pump/dump-signalen.",
    );
  }

  return out;
}

function clampInt(v: number, min = 0, max = 100): number {
  if (!Number.isFinite(v)) return 0;
  if (v < min) return min;
  if (v > max) return max;
  return Math.round(v);
}

// ============================================================
//  Helpers voor caller (Holding[] → CryptoPosition[])
// ============================================================

/**
 * Classificeer een ticker als BTC / ETH. Accepteert varianten zoals
 * "BTC-USD", "BTCUSD", "BTC-EUR", "BITCOIN", "ETHEREUM".
 */
export function classifyCryptoTicker(
  ticker: string | null | undefined,
  name?: string | null,
): CryptoAssetKey | null {
  const t = (ticker ?? "").toUpperCase().trim();
  const n = (name ?? "").toUpperCase().trim();
  if (t.startsWith("BTC") || t.includes("BITCOIN") || n.includes("BITCOIN")) {
    return "BTC";
  }
  if (
    t.startsWith("ETH") ||
    t.includes("ETHEREUM") ||
    n.includes("ETHEREUM")
  ) {
    return "ETH";
  }
  return null;
}
