/**
 * Crypto Risk & Momentum Lab — types (Module 12).
 *
 * **Filosofie**: BeleggerIQ is een risico-intelligentieplatform, geen
 * casino. Deze module bedient crypto-gebruikers maar positioneert de
 * informatie expliciet als RISICO-laag, niet als koop-trigger.
 *
 * **Scope v1**: BTC + ETH. Andere coins (memecoins, altcoins) blijven
 * buiten scope — bewust, om niet te suggereren dat we ze "dekken".
 *
 * **Topbelegger-laag**:
 *  - Buffett: explicit speculation-warning bij elke significante exposure.
 *  - Dalio: behandel crypto als alternatieve asset met scenario-risico.
 *  - Lynch: rationales in NL spreektaal met getallen.
 *  - Simons: pure-functie laag; drempels als `const`; reproduceerbaar.
 *  - Wood: hooks voor future-thema-data zonder hype-taal.
 */

import type { ISODateString } from "@/types/common";

/** Module 12 v1: BTC + ETH only. */
export type CryptoAssetKey = "BTC" | "ETH";

export type CryptoAllocationTier =
  | "none" // 0%
  | "small" // 0-5%
  | "moderate" // 5-15%
  | "high" // 15-30%
  | "very_high"; // >30% — significante speculatie

export type CryptoDataQuality = "high" | "medium" | "low" | "missing";

export type CryptoTrendDirection = "up" | "sideways" | "down" | "unknown";

/**
 * Per-asset metric-pack — afgeleid uit price-history (1y dagelijks).
 * Pure functie van de price-series; geen real-time fetching.
 */
export interface CryptoAssetMetrics {
  asset: CryptoAssetKey;
  /** 12-mnd return als fractie (0.45 = +45%); null wanneer onvoldoende data. */
  return12m: number | null;
  /** 30-dagen recente return als fractie. */
  return30d: number | null;
  /** Geannualiseerde volatiliteit (std-dev × √252) als fractie. */
  annualizedVolatility: number | null;
  /** Maximale piek-tot-dal-drawdown in window (negatief, bv. -0.65 = -65%). */
  maxDrawdown: number | null;
  /** Momentum-score 0..100 (50 = neutraal). */
  momentumScore: number;
  /** Trend-sterkte 0..100 — hoeveel van de afgelopen 60 dagen boven 200d MA. */
  trendStrength: number;
  trendDirection: CryptoTrendDirection;
  /** Hoeveel datapunten zaten in de berekening (transparantie). */
  sampleSize: number;
  dataQuality: CryptoDataQuality;
}

/** Eén crypto-positie van de gebruiker. */
export interface CryptoPosition {
  ticker: string;
  name: string;
  /** Marktwaarde in base-currency. */
  marketValueBase: number;
  /** Gewicht binnen totale portefeuille 0..1. */
  weight: number;
  /** Geklassificeerd als BTC of ETH (anders null). */
  asset: CryptoAssetKey | null;
}

/** Position-sizing classificatie. */
export type SizingTier = "comfortable" | "watch" | "warning" | "critical";

export interface CryptoSizingAssessment {
  tier: SizingTier;
  /** Concrete drempel die geraakt is. */
  threshold: number;
  /** 1-zin uitleg in NL — waarschuwingstoon, geen advies. */
  message: string;
}

/**
 * Hoofd-output: één rapport voor de UI.
 */
export interface CryptoRiskReport {
  generatedAt: ISODateString;
  /** Som crypto-marktwaarde in base-currency. */
  totalCryptoValue: number;
  /** Crypto-fractie t.o.v. totale portefeuille. */
  allocationFraction: number;
  allocationTier: CryptoAllocationTier;
  positions: CryptoPosition[];
  /** Per-asset metrics; bevat alleen BTC/ETH (v1). */
  assets: CryptoAssetMetrics[];
  /** Sizing-warning per positie (top-1 zwaarste). */
  sizing: CryptoSizingAssessment;
  /** Speculatie-score 0..100 — hoger = meer risico-blootstelling. */
  speculationScore: number;
  /** Lijst expliciete waarschuwingen, in volgorde van ernst. */
  warnings: string[];
  /** Universele disclaimer-string. */
  disclaimer: string;
}

// ============================================================
//  Labels (NL)
// ============================================================

export const CRYPTO_ASSET_LABELS: Record<CryptoAssetKey, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
};

export const ALLOCATION_TIER_LABELS: Record<CryptoAllocationTier, string> = {
  none: "Geen crypto-exposure",
  small: "Beperkt (≤5%)",
  moderate: "Substantieel (5-15%)",
  high: "Hoog (15-30%)",
  very_high: "Zeer hoog (>30%)",
};

export const SIZING_TIER_LABELS: Record<SizingTier, string> = {
  comfortable: "Comfortabel",
  watch: "Houd in de gaten",
  warning: "Waarschuwing",
  critical: "Kritiek hoog",
};

/**
 * Universele Module 12 disclaimer — getoond bovenaan elke crypto-lab UI.
 * Bewust in expliciete bewoording: dit is GEEN advies, dit is speculatie.
 */
export const CRYPTO_LAB_DISCLAIMER =
  "Crypto is een speculatieve asset-class met historisch grote drawdowns (>70%) en lange droogteperiodes. De cijfers in deze lab zijn meetwaarden, geen koopsignalen — BeleggerIQ promoot geen leverage, geen pump/dump-tactiek, geen 'koop nu'-actie.";
