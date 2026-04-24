import type { FactorScore } from "@/types/factor";
import type { MarketRegimeScore } from "@/types/regime";
import type { HistoricalPoint } from "@/types/market";

import type {
  OpportunityConfidence,
  OpportunitySignal,
  OpportunitySignalType,
} from "./types";

/**
 * Acht pure signaal-detectoren. Elk accepteert een specifieke input en
 * retourneert `OpportunitySignal | null`. Null = signaal niet getriggerd
 * OF onvoldoende data.
 *
 * Geen van deze functies doet I/O. Callers (engine.ts) verzamelen de
 * input-data en roepen de detectoren per kandidaat aan.
 *
 * Design-regels per signaal:
 *  - Elke detector heeft een expliciete **drempel** (bv. quality ≥ 70)
 *    en een **maximum-sterkte-formule** zodat het resultaat
 *    reproduceerbaar is.
 *  - Elke detector levert minimaal één `rationale`-bullet + één
 *    `riskNote`. Dat maakt de output uitlegbaar in de UI.
 *  - Confidence leunt op de aanwezige data: een signaal dat op
 *    volledige factor-scores + 12m-history leunt is HIGH; op slechts
 *    1 input MEDIUM; missende input → null (geen signaal).
 */

const DETECTED_AT = () => new Date().toISOString();

// ============================================================
//  Shared helpers (pure)
// ============================================================

function scaleStrength(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max === min) return value >= max ? 100 : 0;
  const pct = ((value - min) / (max - min)) * 100;
  return clamp(Math.round(pct), 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function pctChange(latest: number, baseline: number): number {
  if (!Number.isFinite(latest) || !Number.isFinite(baseline) || baseline <= 0) {
    return 0;
  }
  return (latest - baseline) / baseline;
}

/**
 * Slim subset van HistoricalPoint om niet telkens type-gymnastics te doen.
 * Aangenomen: history is **oplopend** gesorteerd (zie `getHistory`).
 */
function latestClose(history: HistoricalPoint[]): number | null {
  const last = history.length > 0 ? history[history.length - 1] : null;
  return last && Number.isFinite(last.close) ? last.close : null;
}

function closeNDaysAgo(
  history: HistoricalPoint[],
  days: number,
): number | null {
  if (history.length === 0) return null;
  // Sorted ascending → we willen een punt ~`days` trading days vóór het laatste.
  // Approximatie: index = length - 1 - days, clamped naar 0.
  const idx = Math.max(0, history.length - 1 - days);
  const point = history[idx];
  return point && Number.isFinite(point.close) ? point.close : null;
}

function highInWindow(
  history: HistoricalPoint[],
  days: number,
): number | null {
  if (history.length === 0) return null;
  const slice = history.slice(Math.max(0, history.length - days));
  let max = -Infinity;
  for (const p of slice) {
    const candidate = p.high ?? p.close;
    if (Number.isFinite(candidate) && candidate > max) max = candidate;
  }
  return Number.isFinite(max) ? max : null;
}

// ============================================================
//  1) Quality pullback
// ============================================================

export interface QualityPullbackInput {
  factorScore?: FactorScore | null;
  /** Dagelijkse history, oplopend gesorteerd. */
  priceHistory?: HistoricalPoint[] | null;
}

/**
 * Hoge quality-score met recente koersdaling.
 * Drempel: quality ≥ 70 AND (3m-return ≤ -10% OR current ≤ 52w-high × 0.85).
 * Sterkte: schaalt met quality-excess boven 70 (0..30 range) + drawdown-magnitude.
 */
export function detectQualityPullback(
  input: QualityPullbackInput,
): OpportunitySignal | null {
  const quality = input.factorScore?.subScores.quality;
  const history = input.priceHistory ?? [];
  if (
    typeof quality !== "number" ||
    !Number.isFinite(quality) ||
    quality < 70 ||
    history.length < 60
  ) {
    return null;
  }
  const latest = latestClose(history);
  const threeMonthsAgo = closeNDaysAgo(history, 63); // ~63 trading days
  const high52w = highInWindow(history, 252);
  if (latest === null || (threeMonthsAgo === null && high52w === null)) {
    return null;
  }

  const return3m = threeMonthsAgo !== null ? pctChange(latest, threeMonthsAgo) : 0;
  const fromHigh = high52w !== null ? pctChange(latest, high52w) : 0;
  const triggered = return3m <= -0.1 || fromHigh <= -0.15;
  if (!triggered) return null;

  const qualityStrength = scaleStrength(quality, 70, 100); // 0..100 over 70..100 range
  const drawdownStrength = scaleStrength(
    Math.max(-return3m, -fromHigh),
    0.1,
    0.35,
  ); // diepere drawdown → sterker
  const strength = clamp(
    Math.round((qualityStrength + drawdownStrength) / 2),
    0,
    100,
  );

  const rationale = [
    `Quality-score ${Math.round(quality)}/100 — sterk fundamentaal profiel.`,
  ];
  if (return3m <= -0.1) {
    rationale.push(
      `Koers afgelopen 3 maanden ${(return3m * 100).toFixed(1)}% — pullback.`,
    );
  }
  if (fromHigh <= -0.15) {
    rationale.push(
      `Afstand tot 52-weeks-high: ${(fromHigh * 100).toFixed(1)}%.`,
    );
  }

  return {
    type: "quality-pullback",
    strength,
    confidence: determineConfidence([
      history.length >= 200,
      quality >= 80,
    ]),
    rationale,
    riskNote:
      "Pullbacks komen soms door een échte breuk in de business (gewijzigde guidance, regelgeving). Controleer of de fundamentals bevestigd zijn vóór actie.",
    detectedAt: DETECTED_AT(),
  };
}

// ============================================================
//  2) Value dislocation
// ============================================================

export interface ValueDislocationInput {
  factorScore?: FactorScore | null;
}

/**
 * Hoge value-score terwijl momentum laag is.
 * Drempel: value ≥ 65 AND momentum ≤ 45.
 * Sterkte: schaalt met de "dislocatie-spread" (value − momentum).
 */
export function detectValueDislocation(
  input: ValueDislocationInput,
): OpportunitySignal | null {
  const value = input.factorScore?.subScores.value;
  const momentum = input.factorScore?.subScores.momentum;
  if (
    typeof value !== "number" ||
    typeof momentum !== "number" ||
    !Number.isFinite(value) ||
    !Number.isFinite(momentum)
  ) {
    return null;
  }
  if (value < 65 || momentum > 45) return null;

  const spread = value - momentum; // minimaal 20 bij trigger
  const strength = scaleStrength(spread, 20, 70);

  return {
    type: "value-dislocation",
    strength,
    confidence: determineConfidence([value >= 75, momentum <= 35]),
    rationale: [
      `Value-score ${Math.round(value)}/100 — ondergewaardeerd.`,
      `Momentum ${Math.round(momentum)}/100 — nog niet door de markt herontdekt.`,
      `Spread value − momentum: +${Math.round(spread)} pt.`,
    ],
    riskNote:
      "Value-trap risico: lage momentum kan ook betekenen dat er structureel iets mis is (sector in verval, management-issue). Check of het bedrijf nog groeit.",
    detectedAt: DETECTED_AT(),
  };
}

// ============================================================
//  3) Momentum reversal
// ============================================================

export interface MomentumReversalInput {
  priceHistory?: HistoricalPoint[] | null;
}

/**
 * 12-maands return negatief, laatste 3 maanden positief → mogelijke
 * omkeer van trend. Signaal is zwakker dan "pure" momentum omdat
 * reversal instabiel is; daarom plafonneren we strength op 75.
 */
export function detectMomentumReversal(
  input: MomentumReversalInput,
): OpportunitySignal | null {
  const history = input.priceHistory ?? [];
  if (history.length < 200) return null;
  const latest = latestClose(history);
  const threeMonthsAgo = closeNDaysAgo(history, 63);
  const twelveMonthsAgo = closeNDaysAgo(history, 252);
  if (latest === null || threeMonthsAgo === null || twelveMonthsAgo === null) {
    return null;
  }
  const return3m = pctChange(latest, threeMonthsAgo);
  const return12m = pctChange(latest, twelveMonthsAgo);
  // Trigger: 12m negatief (≥ -5%), 3m duidelijk positief (≥ +5%).
  if (return12m > -0.05) return null;
  if (return3m < 0.05) return null;

  // Sterkte: combinatie van hoe diep de 12m daling was en hoe sterk de 3m recovery.
  const drawdownStrength = scaleStrength(-return12m, 0.05, 0.4);
  const recoveryStrength = scaleStrength(return3m, 0.05, 0.25);
  const strength = clamp(
    Math.round((drawdownStrength + recoveryStrength) / 2),
    0,
    75,
  ); // plafond 75: reversal is intrinsiek onzeker

  return {
    type: "momentum-reversal",
    strength,
    confidence: "MEDIUM", // altijd medium — reversal is volatiel
    rationale: [
      `12m-return ${(return12m * 100).toFixed(1)}% — negatieve trend.`,
      `3m-return +${(return3m * 100).toFixed(1)}% — recente ommekeer.`,
    ],
    riskNote:
      "Een 3-maands recovery is géén bevestigde trendwissel. Watch the next earnings + breadth. Historisch gemiddelde faalkans: ~40%.",
    detectedAt: DETECTED_AT(),
  };
}

// ============================================================
//  4) Watchlist target reached
// ============================================================

export interface WatchlistTargetInput {
  targetPrice: number | null | undefined;
  /** Huidige koers uit Quote. */
  currentPrice: number | null | undefined;
}

/**
 * Trigger wanneer de user een target-price heeft gezet en de koers
 * daadwerkelijk binnen 5% van dat target is aangekomen.
 */
export function detectWatchlistTarget(
  input: WatchlistTargetInput,
): OpportunitySignal | null {
  const target = input.targetPrice;
  const current = input.currentPrice;
  if (
    typeof target !== "number" ||
    typeof current !== "number" ||
    !Number.isFinite(target) ||
    !Number.isFinite(current) ||
    target <= 0 ||
    current <= 0
  ) {
    return null;
  }
  // Huidige koers is ≤ target (BUY trigger voor long watchlist) of binnen 5% marge.
  const ratio = current / target;
  if (ratio > 1.05) return null; // nog ver boven target

  // Strengte: hoe dichter op/onder target, hoe sterker.
  // ratio == 1 → 80; ratio == 0.9 → 100; ratio == 1.05 → 40.
  let strength: number;
  if (ratio <= 0.9) strength = 100;
  else if (ratio <= 1) strength = clamp(80 + Math.round((1 - ratio) * 200), 80, 100);
  else strength = clamp(80 - Math.round((ratio - 1) * 800), 40, 80);

  return {
    type: "watchlist-target",
    strength,
    confidence: "HIGH", // gebruiker heeft dit zelf ingesteld
    rationale: [
      `Target: ${target.toFixed(2)} · huidige koers: ${current.toFixed(2)}.`,
      ratio <= 1
        ? `Koers ${Math.round((1 - ratio) * 100)}% onder target — trigger bereikt.`
        : `Koers slechts ${Math.round((ratio - 1) * 100)}% boven target — bijna aan.`,
    ],
    riskNote:
      "Een target-price bevestigt niet automatisch een koopsignaal. Her-evalueer de thesis: zijn de fundamentals sinds het zetten van de target veranderd?",
    detectedAt: DETECTED_AT(),
  };
}

// ============================================================
//  5) Underweight high conviction
// ============================================================

export interface UnderweightConvictionInput {
  factorScore?: FactorScore | null;
  currentWeight?: number | null; // fractie
  targetWeight?: number | null; // fractie (bv. uit policy)
}

/**
 * Positie in de portefeuille met hoge composite-score maar
 * ondergewogen t.o.v. target. Trigger: composite ≥ 70 én
 * currentWeight ≤ targetWeight × 0.7.
 */
export function detectUnderweightConviction(
  input: UnderweightConvictionInput,
): OpportunitySignal | null {
  const composite = input.factorScore?.composite;
  const current = input.currentWeight;
  const target = input.targetWeight;
  if (
    typeof composite !== "number" ||
    typeof current !== "number" ||
    typeof target !== "number" ||
    target <= 0
  ) {
    return null;
  }
  if (composite < 70) return null;
  if (current > target * 0.7) return null;

  const gap = 1 - current / target; // > 0.3 bij trigger
  const strength = scaleStrength(gap, 0.3, 0.8);

  return {
    type: "underweight-high-conviction",
    strength,
    confidence: input.factorScore?.confidence && input.factorScore.confidence >= 0.6 ? "HIGH" : "MEDIUM",
    rationale: [
      `Composite score ${Math.round(composite)}/100 — hoge conviction.`,
      `Huidig gewicht ${(current * 100).toFixed(1)}% vs target ${(target * 100).toFixed(1)}% — onderwogen.`,
    ],
    riskNote:
      "Ondergewicht kan bewust zijn (recent verkocht om risico te verlagen). Controleer je laatste trade-rationale voor je bijkoopt.",
    detectedAt: DETECTED_AT(),
  };
}

// ============================================================
//  6) ETF core rebalance
// ============================================================

export interface EtfCoreRebalanceInput {
  isBroadMarketEtf: boolean;
  currentWeight?: number | null;
  targetWeight?: number | null;
}

/**
 * Broad-market ETF dat ondergewogen is — typisch maandelijkse
 * bijkoop-kandidaat voor wie een core-satelliet portefeuille draait.
 * Simpeler dan `underweight-high-conviction`: geen factor-score nodig.
 */
export function detectEtfCoreRebalance(
  input: EtfCoreRebalanceInput,
): OpportunitySignal | null {
  if (!input.isBroadMarketEtf) return null;
  const current = input.currentWeight;
  const target = input.targetWeight;
  if (
    typeof current !== "number" ||
    typeof target !== "number" ||
    target <= 0
  ) {
    return null;
  }
  if (current >= target * 0.9) return null; // ruim genoeg op gewicht

  const gap = 1 - current / target;
  const strength = scaleStrength(gap, 0.1, 0.5);

  return {
    type: "etf-core-rebalance",
    strength,
    confidence: "HIGH",
    rationale: [
      `Core-ETF onder target: ${(current * 100).toFixed(1)}% vs ${(target * 100).toFixed(1)}%.`,
      "Broad-market exposure; factor-scoring is niet van toepassing.",
    ],
    riskNote:
      "Bij een defensief marktregime kan bewust worden uitgesteld. Check Market Regime score voor je bijkoopt.",
    detectedAt: DETECTED_AT(),
  };
}

// ============================================================
//  7) Defensive bargain
// ============================================================

export interface DefensiveBargainInput {
  factorScore?: FactorScore | null;
  priceHistory?: HistoricalPoint[] | null;
  regime?: MarketRegimeScore | null;
}

/**
 * Hoge lowVol-score én recente koersdaling. Sterker signaal in een
 * DEFENSIVE marktregime (regime-score onder 40).
 * Trigger: lowVol ≥ 70 AND 3m-return ≤ -8%.
 */
export function detectDefensiveBargain(
  input: DefensiveBargainInput,
): OpportunitySignal | null {
  const lowVol = input.factorScore?.subScores.lowVol;
  const history = input.priceHistory ?? [];
  if (
    typeof lowVol !== "number" ||
    !Number.isFinite(lowVol) ||
    lowVol < 70 ||
    history.length < 60
  ) {
    return null;
  }
  const latest = latestClose(history);
  const threeMonthsAgo = closeNDaysAgo(history, 63);
  if (latest === null || threeMonthsAgo === null) return null;
  const return3m = pctChange(latest, threeMonthsAgo);
  if (return3m > -0.08) return null;

  let strength = clamp(
    Math.round(
      (scaleStrength(lowVol, 70, 100) + scaleStrength(-return3m, 0.08, 0.25)) /
        2,
    ),
    0,
    100,
  );
  // Boost wanneer regime defensief is — dan weegt defensive kwaliteit dubbel.
  if (input.regime?.stance === "DEFENSIVE") {
    strength = clamp(strength + 10, 0, 100);
  }

  return {
    type: "defensive-bargain",
    strength,
    confidence: determineConfidence([
      history.length >= 200,
      input.regime?.stance === "DEFENSIVE",
    ]),
    rationale: [
      `LowVol-score ${Math.round(lowVol)}/100 — stabiel koersprofiel.`,
      `3m-return ${(return3m * 100).toFixed(1)}% — meegezakt met markt.`,
      input.regime?.stance === "DEFENSIVE"
        ? "Marktregime DEFENSIVE — defensive kwaliteit krijgt extra gewicht."
        : "Marktregime geen DEFENSIVE — blijf nuchter.",
    ],
    riskNote:
      "LowVol is geen garantie tijdens een brede selloff; ook defensieve aandelen kunnen 20%+ dalen. Niet gebruiken als bodem-timing.",
    detectedAt: DETECTED_AT(),
  };
}

// ============================================================
//  8) Earnings / sentiment — placeholder
// ============================================================

/**
 * Placeholder-detector voor wanneer we later een earnings-calendar of
 * sentiment-feed aanhaken (Finnhub, Benzinga, Alpha Vantage news). Nu
 * retourneert 'ie **altijd null** zodat de engine consistent is, maar
 * documentenen we expliciet de design-intentie.
 *
 * Wanneer de data er is: trigger bij (a) earnings binnen 5 trading days
 * én (b) sentiment-score ≥ 70 OF een gap-up-na-earnings patroon.
 */
export function detectEarningsSentiment(): OpportunitySignal | null {
  return null;
}

// ============================================================
//  Confidence-helper
// ============================================================

/**
 * Heuristiek: hoeveel "extra" bevestigingen van de detector zijn true?
 * ≥ 2 → HIGH, 1 → MEDIUM, 0 → LOW. Shared door meerdere detectoren.
 */
function determineConfidence(checks: boolean[]): OpportunityConfidence {
  const count = checks.filter(Boolean).length;
  if (count >= 2) return "HIGH";
  if (count === 1) return "MEDIUM";
  return "LOW";
}

// ============================================================
//  Registry — handig voor tests + introspection
// ============================================================

export const SIGNAL_DETECTORS: Record<OpportunitySignalType, string> = {
  "quality-pullback": "detectQualityPullback",
  "value-dislocation": "detectValueDislocation",
  "momentum-reversal": "detectMomentumReversal",
  "watchlist-target": "detectWatchlistTarget",
  "underweight-high-conviction": "detectUnderweightConviction",
  "etf-core-rebalance": "detectEtfCoreRebalance",
  "defensive-bargain": "detectDefensiveBargain",
  "earnings-sentiment-placeholder": "detectEarningsSentiment",
};
