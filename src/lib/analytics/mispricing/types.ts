import type { ISODateString } from "@/types/common";

/**
 * Mispricing Scanner types.
 *
 * De scanner zoekt **structurele** prijs/kans-afwijkingen met een
 * duidelijke verwachte holding-periode en automatische vervaldatum. Dit
 * is géén day-trading-tool en géén orderadvies: elk signaal draagt een
 * verplichte risico-nota, risk-flags én een expliciete data-quality
 * vereiste zodat de gebruiker ziet op welke input het rust.
 *
 * Design-principes:
 *  - Reproduceerbaar: elk signaal is een pure functie van numerieke
 *    inputs (fundamentals, factor-scores, price history, peer-basket).
 *    Geen AI, geen willekeur, geen verzonnen waarden.
 *  - Explainable: elk signaal levert `rationale[]` en `riskNote` in het
 *    Nederlands. AI mag deze uitleg later samenvatten maar niet bewerken.
 *  - Auto-expiry: elk signaal krijgt `expiresAt = detectedAt + ttlDays`.
 *    Verouderde signalen vallen uit de radar zodat stale data geen
 *    koopsignaal blijft.
 *  - Defensief bij missende data: detector retourneert `null` wanneer
 *    `dataQuality.met === false`. Nooit een gok.
 *  - Geen leverage, geen auto-execution: het type-systeem heeft bewust
 *    geen "orderSize", "leverage" of "executionVenue" velden.
 */

// ============================================================
//  Signaal-taxonomie
// ============================================================

export const MISPRICING_SIGNAL_TYPES = [
  "valuation-gap",
  "peer-dislocation",
  "quality-price-divergence",
  "sentiment-price-divergence",
] as const;

export type MispricingSignalType = (typeof MISPRICING_SIGNAL_TYPES)[number];

export type MispricingConfidenceTier = "HIGH" | "MEDIUM" | "LOW";

/**
 * Risk-flag codes (stabiele strings → bruikbaar voor UI-filtering /
 * i18n). De string zelf is Nederlands want we gebruiken 'm direct in de
 * tooltip; de code is de prefix vóór de ":".
 */
export type MispricingRiskFlagCode =
  | "value-trap"
  | "earnings-deterioration-unknown"
  | "thin-peer-basket"
  | "small-sample-volatility"
  | "short-history"
  | "single-source-fundamentals"
  | "sentiment-proxy-only"
  | "quality-degradation-unknown"
  | "momentum-reversal-fragile";

export interface MispricingRiskFlag {
  code: MispricingRiskFlagCode;
  /** NL-zin die de flag uitlegt; gebruikt in de UI. */
  label: string;
}

// ============================================================
//  Data-quality vereisten
// ============================================================

/**
 * Expliciet wat een detector **minimaal** nodig heeft. Dit wordt in de
 * signaal-output opgenomen zodat de UI kan tonen: "dit signaal leunt op
 * fundamentals + een peer-basket van ≥ 5 tickers".
 */
export interface MispricingDataQualityRequirement {
  /** Minimum aantal daily-history punten. */
  minHistoryDays: number;
  /** Zijn fundamentals (P/E, FCF, ROIC, ...) vereist? */
  requiresFundamentals: boolean;
  /** Zijn factor-scores (quality, lowVol, ...) vereist? */
  requiresFactorScore: boolean;
  /** Is een peer-basket vereist? Indien ja: minimale peer-count. */
  requiresPeerBasket: boolean;
  minPeerCount: number;
}

export interface MispricingDataQualityAssessment {
  required: MispricingDataQualityRequirement;
  /** Werd aan alle eisen voldaan? */
  met: boolean;
  /** Concrete lijst met ontbrekende inputs (lege array bij `met: true`). */
  missing: string[];
  /** Vertrouwen in de onderliggende data (0..1). */
  score: number;
}

// ============================================================
//  Signaal
// ============================================================

export interface MispricingSignal {
  type: MispricingSignalType;
  ticker: string;
  /** 0..100 — sterkte van de afwijking. Hoger = sterker. */
  mispricingScore: number;
  /** 0..1 — numerieke confidence. Tier wordt hieruit afgeleid. */
  confidence: number;
  confidenceTier: MispricingConfidenceTier;
  /** Verwachte holding-periode waarop de afwijking geacht wordt te convergeren. */
  expectedHoldingPeriodDays: number;
  /** Risico-flags (kort, machine-leesbaar + NL-label). */
  riskFlags: MispricingRiskFlag[];
  /** Data-quality vereisten + meting. */
  dataQuality: MispricingDataQualityAssessment;
  /** NL-bullets die het triggeren uitleggen. */
  rationale: string[];
  /** Verplichte risico-nota: "wat kan hier mis gaan". */
  riskNote: string;
  detectedAt: ISODateString;
  expiresAt: ISODateString;
}

// ============================================================
//  Aggregatie per ticker
// ============================================================

export interface MispricingCandidate {
  ticker: string;
  name: string;
  signals: MispricingSignal[];
  /** 0..100 — aggregate score (max-strength × diversity-bonus, cap 1.2). */
  aggregateScore: number;
  /** 0..1 — gewogen confidence over onderliggende signalen. */
  aggregateConfidence: number;
  aggregateConfidenceTier: MispricingConfidenceTier;
  /** Mediaan van `expectedHoldingPeriodDays` over signalen. */
  medianHoldingPeriodDays: number;
  /** Vroegste expiresAt — kandidaat vervalt zodra een signaal vervalt. */
  earliestExpiresAt: ISODateString;
  /** Alle uniek gemeten risk-flag codes over signalen heen. */
  riskFlagCodes: MispricingRiskFlagCode[];
  summary: string;
}

// ============================================================
//  Report
// ============================================================

export interface MispricingReport {
  scannedAt: ISODateString;
  /** TTL-config waarmee deze scan is uitgevoerd (≥ 1). */
  signalTtlDays: number;
  candidateCount: number;
  candidates: MispricingCandidate[];
  /** Tellers per signaal-type over de getoonde kandidaten. */
  signalDistribution: Record<MispricingSignalType, number>;
  /** Hoeveel tickers zijn gescand (ongeacht of ze een signaal gaven). */
  tickersScanned: number;
}

// ============================================================
//  UI-labels (NL, consistent met /kansen)
// ============================================================

export const MISPRICING_SIGNAL_LABELS: Record<MispricingSignalType, string> = {
  "valuation-gap": "Waarderingsgat",
  "peer-dislocation": "Peer-dislocatie",
  "quality-price-divergence": "Kwaliteit vs prijs divergentie",
  "sentiment-price-divergence": "Sentiment vs prijs divergentie",
};

export const MISPRICING_SIGNAL_DESCRIPTIONS: Record<
  MispricingSignalType,
  string
> = {
  "valuation-gap":
    "Huidige waarderingsratio's liggen significant onder sector/historische mediaan.",
  "peer-dislocation":
    "Koers blijft fors achter bij peer-basket zonder fundamentele verslechtering.",
  "quality-price-divergence":
    "Kwaliteitsscore hoog terwijl de koers in 12m flink gedaald is.",
  "sentiment-price-divergence":
    "Recente koersvolatiliteit of negatief sentiment staat los van de stabiele factor-profiel.",
};

// ============================================================
//  Helpers (pure)
// ============================================================

/** Derive NL-tier-label uit numerieke confidence (0..1). */
export function deriveConfidenceTier(
  confidence: number,
): MispricingConfidenceTier {
  if (!Number.isFinite(confidence) || confidence < 0) return "LOW";
  if (confidence >= 0.7) return "HIGH";
  if (confidence >= 0.4) return "MEDIUM";
  return "LOW";
}

/** Bouw een risk-flag met NL-label. */
export function buildRiskFlag(
  code: MispricingRiskFlagCode,
): MispricingRiskFlag {
  return { code, label: RISK_FLAG_LABELS[code] };
}

const RISK_FLAG_LABELS: Record<MispricingRiskFlagCode, string> = {
  "value-trap":
    "Waarderingsval mogelijk — lage ratio's kunnen structurele winstdaling weerspiegelen.",
  "earnings-deterioration-unknown":
    "Recente winstontwikkeling niet gecontroleerd; mogelijk onderliggende verslechtering.",
  "thin-peer-basket":
    "Peer-basket is klein; peer-vergelijking is minder robuust.",
  "small-sample-volatility":
    "Volatiliteitsmeting op kleine sample; interpretatie is onzeker.",
  "short-history":
    "Minder dan een volledig jaar aan koersdata; lange-termijn claims zwak onderbouwd.",
  "single-source-fundamentals":
    "Fundamentals komen uit één provider; geen cross-check tegen second source.",
  "sentiment-proxy-only":
    "Geen echte sentiment-feed; signaal gebruikt volatility-proxy i.p.v. news/flow data.",
  "quality-degradation-unknown":
    "Geen historische factor-snapshots; mogelijk is de quality-score recent gekelderd.",
  "momentum-reversal-fragile":
    "Keerpunt kan kortstondig zijn; vroege signalen zijn vaak fragiel.",
};
