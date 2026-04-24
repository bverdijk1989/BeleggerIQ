import type {
  OpportunityCandidate,
  OpportunityConfidence,
  OpportunitySignal,
  OpportunitySource,
} from "./types";
import type { Currency } from "@/types/common";

/**
 * Aggregatie-logica: neem een set signalen voor één ticker en maak er
 * een `OpportunityCandidate` van met composite score, confidence en
 * samenvattende rationale.
 *
 * Scoring-regel:
 *   - Composite = **max signaal-sterkte** × diversity-bonus.
 *   - Diversity-bonus = 1 + 0.08 × (n − 1), capped op 1.25.
 *     Drie stapelende signalen geven 16% bonus; vijf stapelende → cap.
 *     We houden 'm conservatief omdat stapeling vaak correlated is
 *     (value + momentum-reversal gaan soms samen).
 *
 * Confidence-regel:
 *   - Weeg elke signaal-confidence (HIGH=1.0, MEDIUM=0.6, LOW=0.3) op
 *     strength. Bereken gemiddelde; output is de conservatieve tier.
 */

const CONFIDENCE_WEIGHT: Record<OpportunityConfidence, number> = {
  HIGH: 1.0,
  MEDIUM: 0.6,
  LOW: 0.3,
};

export interface BuildCandidateInput {
  ticker: string;
  name: string;
  isin?: string | null;
  source: OpportunitySource;
  signals: OpportunitySignal[];
  currentPrice?: number | null;
  currency?: Currency | null;
}

/**
 * Bouw een kandidaat uit N signalen. Retourneert `null` wanneer er geen
 * enkele signal-strength ≥ 40 is — dan is de kandidaat niet het tonen
 * waard. Drempels zijn in `scanOpportunities` (engine.ts) configurabel.
 */
export function buildCandidate(
  input: BuildCandidateInput,
  options: { minSignalStrength?: number } = {},
): OpportunityCandidate | null {
  const minStrength = options.minSignalStrength ?? 40;
  const strongEnough = input.signals.filter((s) => s.strength >= minStrength);
  if (strongEnough.length === 0) return null;

  const maxStrength = Math.max(...strongEnough.map((s) => s.strength));
  const diversityBonus = Math.min(1.25, 1 + 0.08 * (strongEnough.length - 1));
  const score = clamp(Math.round(maxStrength * diversityBonus), 0, 100);

  const confidence = aggregateConfidence(strongEnough);
  const summary = buildSummary(strongEnough);
  const warnings = collectWarnings(strongEnough, input);

  return {
    ticker: input.ticker,
    name: input.name,
    isin: input.isin ?? null,
    score,
    confidence,
    signals: [...strongEnough].sort((a, b) => b.strength - a.strength),
    source: input.source,
    currentPrice: input.currentPrice ?? null,
    currency: input.currency ?? null,
    summary,
    warnings,
  };
}

// ============================================================
//  Confidence aggregatie (weighted conservative)
// ============================================================

function aggregateConfidence(
  signals: OpportunitySignal[],
): OpportunityConfidence {
  if (signals.length === 0) return "LOW";
  const totalStrength = signals.reduce((sum, s) => sum + s.strength, 0);
  if (totalStrength <= 0) return "LOW";

  const weightedSum = signals.reduce(
    (sum, s) => sum + CONFIDENCE_WEIGHT[s.confidence] * s.strength,
    0,
  );
  const avg = weightedSum / totalStrength;
  if (avg >= 0.85) return "HIGH";
  if (avg >= 0.5) return "MEDIUM";
  return "LOW";
}

// ============================================================
//  Summary-builder (NL, 1 zin)
// ============================================================

function buildSummary(signals: OpportunitySignal[]): string {
  if (signals.length === 0) return "Geen bruikbare signalen.";
  const top = signals.reduce((best, s) =>
    s.strength > best.strength ? s : best,
  );
  const label = TOP_SUMMARY_LABEL[top.type];
  if (signals.length === 1) return label;
  return `${label} (+${signals.length - 1} ander${signals.length - 1 === 1 ? "" : "e"} signa${signals.length - 1 === 1 ? "al" : "len"}).`;
}

const TOP_SUMMARY_LABEL: Record<OpportunitySignal["type"], string> = {
  "quality-pullback": "Kwaliteitsaandeel na recente pullback.",
  "value-dislocation": "Value-dislocatie: ondergewaardeerd én nog niet populair.",
  "momentum-reversal": "Mogelijk momentum-keerpunt na negatieve 12 maanden.",
  "watchlist-target": "Watchlist-target bereikt.",
  "underweight-high-conviction": "Hoge conviction maar ondergewogen in je portefeuille.",
  "etf-core-rebalance": "Core-ETF onder target — bijkoop-kandidaat.",
  "defensive-bargain": "Defensieve kwaliteit op koopje-niveau.",
  "earnings-sentiment-placeholder": "Earnings/sentiment (nog geen data-feed).",
};

// ============================================================
//  Warnings collect
// ============================================================

function collectWarnings(
  signals: OpportunitySignal[],
  input: BuildCandidateInput,
): string[] {
  const out: string[] = [];
  if (signals.every((s) => s.confidence === "LOW")) {
    out.push("Alle gematchte signalen hebben lage confidence.");
  }
  if (input.currentPrice == null) {
    out.push("Geen actuele koers beschikbaar — bedrag-indicaties ontbreken.");
  }
  return out;
}

// ============================================================
//  Helpers
// ============================================================

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
