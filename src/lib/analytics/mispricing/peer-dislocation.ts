import type { HistoricalPoint } from "@/types/market";

import {
  buildRiskFlag,
  deriveConfidenceTier,
  type MispricingDataQualityAssessment,
  type MispricingDataQualityRequirement,
  type MispricingSignal,
} from "./types";
import {
  clamp,
  computeExpiresAt,
  median,
  scaleStrength,
  trailingReturn,
} from "./shared";

/**
 * Detector 2/4 — **peer-dislocation**.
 *
 * Triggert wanneer de 12-maands return van de ticker **significant
 * achterloopt** op de mediane 12m-return van een peer-basket (bv.
 * sector- of industry-genoten). Het signaal wint aan kracht naarmate
 * de achterstand groter is, de peer-basket groter en de fundamentele
 * kerngegevens (marges, ROIC) niet structureel verslechterd lijken.
 *
 * Belangrijk: de detector kent de fundamentals niet, alleen een
 * optionele **fundamentalsStable** boolean die door de caller wordt
 * geleverd. Als die ontbreekt, krijgt het signaal een
 * "earnings-deterioration-unknown"-flag (geen gok: lagere confidence).
 *
 * Holding-periode: 180 dagen (peer-relatief reverts sneller dan
 * absolute waarderingsgaten).
 */

// ============================================================
//  Drempels
// ============================================================

/** Minimale peer-basket grootte voordat we uberhaupt rekenen. */
const MIN_PEER_COUNT = 3;
/** Onder dit aantal krijgt het signaal een thin-basket flag. */
const SAFE_PEER_COUNT = 6;

/** Minimum excess return (negatief, fractie). Bv. -0.10 = 10% achter. */
const MIN_EXCESS_RETURN = -0.1;
/** Clamp-grens voor 100-strength (-0.40 = 40% achterstand). */
const MAX_EXCESS_RETURN = -0.4;

/** Trailing window voor de vergelijking. */
const TRAILING_DAYS = 252; // ~12m

const DEFAULT_HOLDING_PERIOD_DAYS = 180;

const DATA_QUALITY_REQUIREMENT: MispricingDataQualityRequirement = {
  minHistoryDays: TRAILING_DAYS + 10,
  requiresFundamentals: false,
  requiresFactorScore: false,
  requiresPeerBasket: true,
  minPeerCount: MIN_PEER_COUNT,
};

// ============================================================
//  Input + public fn
// ============================================================

export interface PeerBasketEntry {
  ticker: string;
  /** Oplopend-gesorteerde daily history. */
  priceHistory: HistoricalPoint[];
}

export interface DetectPeerDislocationInput {
  ticker: string;
  /** Oplopende daily history van de doel-ticker. */
  priceHistory: HistoricalPoint[];
  /** Peers in dezelfde sector/industry. Mag niet de ticker zelf bevatten. */
  peers: PeerBasketEntry[];
  /**
   * True als fundamentals (marges, ROIC, revenue-growth) de afgelopen
   * periode niet duidelijk verslechterd zijn. Indien `null`/undefined:
   * de detector voegt `earnings-deterioration-unknown` als flag toe en
   * halveert de confidence.
   */
  fundamentalsStable?: boolean | null;
  now?: string;
  ttlDays?: number;
}

export function detectPeerDislocation(
  input: DetectPeerDislocationInput,
): MispricingSignal | null {
  const detectedAt = input.now ?? new Date().toISOString();
  const ttlDays = input.ttlDays ?? 30;

  const missing: string[] = [];
  if (input.priceHistory.length < TRAILING_DAYS + 1) missing.push("history");
  const validPeers = input.peers.filter(
    (p) =>
      p.ticker !== input.ticker &&
      p.priceHistory.length >= TRAILING_DAYS + 1,
  );
  if (validPeers.length < MIN_PEER_COUNT) missing.push("peer-basket");

  if (missing.length > 0) return null;

  const subjectReturn = trailingReturn(input.priceHistory, TRAILING_DAYS);
  if (subjectReturn === null) return null;

  const peerReturns: number[] = [];
  for (const p of validPeers) {
    const r = trailingReturn(p.priceHistory, TRAILING_DAYS);
    if (r !== null) peerReturns.push(r);
  }
  if (peerReturns.length < MIN_PEER_COUNT) return null;

  const peerMedianReturn = median(peerReturns);
  const excess = subjectReturn - peerMedianReturn;
  if (excess > MIN_EXCESS_RETURN) return null; // niet genoeg achterstand

  // Strength: hoe negatiever `excess`, hoe hoger. We mappen
  // [MIN_EXCESS_RETURN..MAX_EXCESS_RETURN] → [0..100] waarbij
  // MAX_EXCESS_RETURN negatiever is dan MIN_EXCESS_RETURN.
  const rawStrength = scaleStrength(
    -excess,
    -MIN_EXCESS_RETURN,
    -MAX_EXCESS_RETURN,
  );
  const mispricingScore = clamp(rawStrength, 0, 100);

  // Confidence: basis 0.5, +0.15 bij voldoende peers, +0.15 bij stable
  // fundamentals, -0.15 bij onbekende fundamentals.
  let confidence = 0.5;
  if (validPeers.length >= SAFE_PEER_COUNT) confidence += 0.15;
  if (input.fundamentalsStable === true) confidence += 0.15;
  if (input.fundamentalsStable === null || input.fundamentalsStable === undefined) {
    confidence -= 0.15;
  }
  confidence = clamp(confidence, 0, 1);

  const rationale: string[] = [
    `12m-return ${formatPct(subjectReturn)} blijft ${formatPct(
      excess,
    )} achter bij peer-mediaan ${formatPct(peerMedianReturn)} (n=${peerReturns.length}).`,
  ];
  if (input.fundamentalsStable === true) {
    rationale.push(
      "Kern-fundamentals (marges, ROIC, revenue-growth) tonen geen duidelijke verslechtering.",
    );
  }

  const riskFlags = [];
  if (validPeers.length < SAFE_PEER_COUNT) {
    riskFlags.push(buildRiskFlag("thin-peer-basket"));
  }
  if (
    input.fundamentalsStable === null ||
    input.fundamentalsStable === undefined
  ) {
    riskFlags.push(buildRiskFlag("earnings-deterioration-unknown"));
  }

  const dataQuality: MispricingDataQualityAssessment = {
    required: DATA_QUALITY_REQUIREMENT,
    met: true,
    missing: [],
    score: clamp(
      0.4 +
        0.1 * Math.min(validPeers.length, 10) / 10 * 2 +
        (input.fundamentalsStable === true ? 0.2 : 0),
      0,
      1,
    ),
  };

  return {
    type: "peer-dislocation",
    ticker: input.ticker,
    mispricingScore,
    confidence,
    confidenceTier: deriveConfidenceTier(confidence),
    expectedHoldingPeriodDays: DEFAULT_HOLDING_PERIOD_DAYS,
    riskFlags,
    dataQuality,
    rationale,
    riskNote:
      "Een relatieve achterstand kan company-specific nieuws reflecteren (earnings-miss, executive-changes, regulatorisch risico). Controleer altijd de recente news-flow van de ticker voordat je convergentie met peers aanneemt.",
    detectedAt,
    expiresAt: computeExpiresAt(detectedAt, ttlDays),
  };
}

function formatPct(fraction: number): string {
  const sign = fraction >= 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%`;
}
