import type { FactorScore, FundamentalsSnapshot } from "@/types/factor";
import type { HistoricalPoint } from "@/types/market";

import {
  deriveConfidenceTier,
  MISPRICING_SIGNAL_LABELS,
  MISPRICING_SIGNAL_TYPES,
  type MispricingCandidate,
  type MispricingReport,
  type MispricingRiskFlagCode,
  type MispricingSignal,
  type MispricingSignalType,
} from "./types";
import { clamp, median } from "./shared";
import {
  detectPeerDislocation,
  type PeerBasketEntry,
} from "./peer-dislocation";
import { detectQualityPriceDivergence } from "./quality-price-divergence";
import { detectSentimentPriceDivergence } from "./sentiment-price-divergence";
import { detectValuationGap } from "./valuation-gap";

/**
 * Mispricing Scanner — orkestrator.
 *
 * Pure functie: geen I/O, alle data wordt als input meegegeven door de
 * caller (bv. een API-route of een server-helper die getFundamentals,
 * getHistory en getPeerBasket aanroept).
 *
 * Design-regels:
 *  - Elke detector wordt onafhankelijk aangeroepen. Null → geen signaal.
 *  - Signalen worden per ticker gebundeld tot een `MispricingCandidate`.
 *  - Aggregate score = max(strength) × diversity-bonus (1 + 0.08 × (n-1),
 *    cap 1.2). Conservatiever dan opportunity-radar want mispricing-
 *    signalen correleren sterk (valuation + peer-dislocation vallen
 *    vaak samen bij uitverkochte namen).
 *  - `aggregateConfidence` is de strength-gewogen gemiddelde van de
 *    numerieke confidences.
 *  - `earliestExpiresAt`: kandidaat vervalt zodra het **eerste** signaal
 *    vervalt. Dit dwingt dat de UI nooit een deels verlopen signaal-set
 *    toont.
 *  - Signal-TTL is configurabel via `config.signalTtlDays` (default 30).
 */

// ============================================================
//  Input
// ============================================================

export interface MispricingScanInput {
  ticker: string;
  name: string;
  priceHistory: HistoricalPoint[];
  fundamentals?: FundamentalsSnapshot | null;
  factorScore?: FactorScore | null;
  priorFactorScore?: FactorScore | null;

  // Valuation-gap specific
  benchmarkPE?: number | null;
  benchmarkFcfYield?: number | null;
  historicalMedianPE?: number | null;

  // Peer-dislocation specific
  peers?: PeerBasketEntry[];
  fundamentalsStable?: boolean | null;

  // Sentiment specific
  sentimentScore?: number | null;
}

export interface ScanMispricingInput {
  universe: MispricingScanInput[];
  config?: {
    /** Minimum mispricing-score om de kandidaat te tonen (default 40). */
    minScore?: number;
    /** Max kandidaten in output (default 20). */
    maxCandidates?: number;
    /** TTL in dagen voor individuele signalen (default 30). */
    signalTtlDays?: number;
    /**
     * Override `now` voor deterministische output in tests. Default:
     * `new Date().toISOString()`.
     */
    now?: string;
  };
}

// ============================================================
//  Public fn
// ============================================================

export function scanMispricing(input: ScanMispricingInput): MispricingReport {
  const config = input.config ?? {};
  const minScore = config.minScore ?? 40;
  const maxCandidates = config.maxCandidates ?? 20;
  const signalTtlDays = Math.max(1, Math.floor(config.signalTtlDays ?? 30));
  const now = config.now ?? new Date().toISOString();

  const candidates: MispricingCandidate[] = [];

  for (const entry of input.universe) {
    const signals: MispricingSignal[] = [];
    pushIf(
      signals,
      detectValuationGap({
        ticker: entry.ticker,
        fundamentals: entry.fundamentals,
        benchmarkPE: entry.benchmarkPE,
        benchmarkFcfYield: entry.benchmarkFcfYield,
        historicalMedianPE: entry.historicalMedianPE,
        qualityScore: entry.factorScore?.subScores.quality ?? null,
        now,
        ttlDays: signalTtlDays,
      }),
    );
    pushIf(
      signals,
      detectPeerDislocation({
        ticker: entry.ticker,
        priceHistory: entry.priceHistory,
        peers: entry.peers ?? [],
        fundamentalsStable: entry.fundamentalsStable ?? null,
        now,
        ttlDays: signalTtlDays,
      }),
    );
    pushIf(
      signals,
      detectQualityPriceDivergence({
        ticker: entry.ticker,
        factorScore: entry.factorScore,
        priceHistory: entry.priceHistory,
        priorFactorScore: entry.priorFactorScore,
        now,
        ttlDays: signalTtlDays,
      }),
    );
    pushIf(
      signals,
      detectSentimentPriceDivergence({
        ticker: entry.ticker,
        priceHistory: entry.priceHistory,
        sentimentScore: entry.sentimentScore,
        factorScore: entry.factorScore,
        now,
        ttlDays: signalTtlDays,
      }),
    );

    const strong = signals.filter((s) => s.mispricingScore >= minScore);
    if (strong.length === 0) continue;

    candidates.push(buildCandidate(entry.ticker, entry.name, strong));
  }

  // Sorteer op aggregate score desc; tie-break op aantal signalen,
  // dan aggregate confidence, dan alfabetisch.
  candidates.sort((a, b) => {
    if (b.aggregateScore !== a.aggregateScore) {
      return b.aggregateScore - a.aggregateScore;
    }
    if (b.signals.length !== a.signals.length) {
      return b.signals.length - a.signals.length;
    }
    if (b.aggregateConfidence !== a.aggregateConfidence) {
      return b.aggregateConfidence - a.aggregateConfidence;
    }
    return a.ticker.localeCompare(b.ticker);
  });
  const top = candidates.slice(0, maxCandidates);

  const distribution: Record<MispricingSignalType, number> = {
    "valuation-gap": 0,
    "peer-dislocation": 0,
    "quality-price-divergence": 0,
    "sentiment-price-divergence": 0,
  };
  for (const c of top) {
    for (const s of c.signals) distribution[s.type] += 1;
  }
  for (const t of MISPRICING_SIGNAL_TYPES) {
    if (!(t in distribution)) distribution[t] = 0;
  }

  return {
    scannedAt: now,
    signalTtlDays,
    candidateCount: top.length,
    candidates: top,
    signalDistribution: distribution,
    tickersScanned: input.universe.length,
  };
}

// ============================================================
//  Aggregatie per ticker
// ============================================================

function buildCandidate(
  ticker: string,
  name: string,
  signals: MispricingSignal[],
): MispricingCandidate {
  const maxStrength = Math.max(...signals.map((s) => s.mispricingScore));
  const diversityBonus = Math.min(1.2, 1 + 0.08 * (signals.length - 1));
  const aggregateScore = clamp(
    Math.round(maxStrength * diversityBonus),
    0,
    100,
  );

  const totalStrength = signals.reduce((sum, s) => sum + s.mispricingScore, 0);
  const aggregateConfidence =
    totalStrength > 0
      ? clamp(
          signals.reduce(
            (sum, s) => sum + s.confidence * s.mispricingScore,
            0,
          ) / totalStrength,
          0,
          1,
        )
      : 0;

  // Mediane holding-periode — één outlier mag de kandidaat niet
  // onredelijk lang laten lijken.
  const medianHolding = Math.round(
    median(signals.map((s) => s.expectedHoldingPeriodDays)),
  );

  // Vroegste expiresAt: kandidaat vervalt zodra één signaal verloopt.
  const earliestExpiresAt = signals
    .map((s) => s.expiresAt)
    .sort()[0]!;

  // Gecombineerde unieke risk-flag-codes.
  const codeSet = new Set<MispricingRiskFlagCode>();
  for (const s of signals) {
    for (const f of s.riskFlags) codeSet.add(f.code);
  }
  const riskFlagCodes = [...codeSet].sort();

  const sortedByStrength = [...signals].sort(
    (a, b) => b.mispricingScore - a.mispricingScore,
  );
  const topSignal = sortedByStrength[0]!;
  const summary = buildSummary(topSignal, signals.length);

  return {
    ticker,
    name,
    signals: sortedByStrength,
    aggregateScore,
    aggregateConfidence,
    aggregateConfidenceTier: deriveConfidenceTier(aggregateConfidence),
    medianHoldingPeriodDays: medianHolding,
    earliestExpiresAt,
    riskFlagCodes,
    summary,
  };
}

function buildSummary(top: MispricingSignal, total: number): string {
  const label = MISPRICING_SIGNAL_LABELS[top.type];
  if (total === 1) return `${label}.`;
  const other = total - 1;
  return `${label} (+${other} ander${other === 1 ? "" : "e"} signa${other === 1 ? "al" : "len"}).`;
}

function pushIf(
  list: MispricingSignal[],
  signal: MispricingSignal | null,
): void {
  if (signal) list.push(signal);
}

// Export PeerBasketEntry zodat callers het als type kunnen importeren
// zonder een tweede import.
export type { PeerBasketEntry };
