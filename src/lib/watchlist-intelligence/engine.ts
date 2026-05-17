/**
 * Watchlist-intelligence engine — orchestrator.
 *
 * Pure functie. Zelfde input → identieke output. Zorg dat de loader
 * deterministisch hydrateert (geen `Date.now()` in input).
 */

import {
  ALL_EXTRACTORS,
  findSimilarAlternatives,
} from "./signals";
import type { WatchlistIntelligenceInput } from "./input";
import type {
  WatchlistAlternative,
  WatchlistIntelligenceReport,
  WatchlistSignal,
} from "./types";
import { WATCHLIST_SIGNAL_ORDER } from "./types";

// ============================================================
//  Tier-derivation
// ============================================================

const POSITIVE_WEIGHT = 1;
const NEGATIVE_WEIGHT = 1;

/** Module 9: DATA_QUALITY is meta — telt niet mee in tier-score. */
const META_SIGNAL_KEYS = new Set<WatchlistSignal["key"]>(["DATA_QUALITY"]);

function deriveTier(
  signals: WatchlistSignal[],
): WatchlistIntelligenceReport["tier"] {
  let score = 0;
  let activeCount = 0;
  for (const s of signals) {
    if (!s.available) continue;
    if (META_SIGNAL_KEYS.has(s.key)) continue;
    activeCount += 1;
    if (s.direction === "positive") score += s.strength * POSITIVE_WEIGHT;
    else if (s.direction === "negative") score -= s.strength * NEGATIVE_WEIGHT;
  }
  if (activeCount === 0) return "WAIT";
  const normalized = score / activeCount;
  if (normalized >= 60) return "STRONG_OPPORTUNITY";
  if (normalized >= 25) return "POSITIVE";
  if (normalized >= -25) return "NEUTRAL";
  return "WAIT";
}

function buildHeadline(
  ticker: string,
  signals: WatchlistSignal[],
  tier: WatchlistIntelligenceReport["tier"],
): string {
  const positives = signals.filter(
    (s) => s.available && s.direction === "positive",
  );
  const negatives = signals.filter(
    (s) => s.available && s.direction === "negative",
  );
  const strongest = [...positives, ...negatives].sort(
    (a, b) => b.strength - a.strength,
  )[0];

  if (tier === "STRONG_OPPORTUNITY") {
    return `${ticker}: sterke kans — ${strongest?.label.toLowerCase() ?? "meerdere positieve signalen"}.`;
  }
  if (tier === "POSITIVE") {
    return `${ticker}: positief profiel${strongest && strongest.direction === "positive" ? `, vooral ${strongest.label.toLowerCase()}` : ""}.`;
  }
  if (tier === "WAIT") {
    return `${ticker}: nog wachten — ${strongest?.label.toLowerCase() ?? "weinig signaal"}.`;
  }
  return `${ticker}: gemengd beeld — bekijk de signalen.`;
}

function buildWhyInteresting(
  signals: WatchlistSignal[],
  alternatives: WatchlistAlternative[],
): string {
  const positives = signals
    .filter((s) => s.available && s.direction === "positive")
    .sort((a, b) => b.strength - a.strength);
  const negatives = signals
    .filter((s) => s.available && s.direction === "negative")
    .sort((a, b) => b.strength - a.strength);

  const parts: string[] = [];
  if (positives.length > 0) {
    parts.push(
      `Positief: ${positives.slice(0, 2).map((s) => s.label.toLowerCase()).join(" en ")}.`,
    );
  }
  if (negatives.length > 0) {
    parts.push(
      `Let op: ${negatives.slice(0, 2).map((s) => s.label.toLowerCase()).join(" en ")}.`,
    );
  }
  if (alternatives.length > 0) {
    parts.push(
      `Vergelijk eventueel met ${alternatives.slice(0, 2).map((a) => a.ticker).join(", ")}.`,
    );
  }
  if (parts.length === 0) {
    parts.push("Geen sterke signalen actief — nog observeren is een prima keuze.");
  }
  return parts.join(" ");
}

function collectSources(input: WatchlistIntelligenceInput): string[] {
  const sources = new Set<string>();
  if (input.current.factorScore) sources.add("factor-engine");
  if (input.current.fundamentals) sources.add("fundamentals");
  if (input.current.previousFactorScore) sources.add("factor-snapshot-history");
  if (input.macro) sources.add("macro-regime");
  if (input.universe.length > 0) sources.add("portfolio + watchlist universe");
  return [...sources];
}

// ============================================================
//  Public API
// ============================================================

export function buildWatchlistIntelligenceReport(
  input: WatchlistIntelligenceInput,
): WatchlistIntelligenceReport {
  const signals = ALL_EXTRACTORS.map((fn) => fn(input));
  // Sorteer naar canonical UI-volgorde.
  const byKey = new Map(signals.map((s) => [s.key, s]));
  const ordered = WATCHLIST_SIGNAL_ORDER.map((k) => byKey.get(k)).filter(
    (s): s is WatchlistSignal => s !== undefined,
  );

  const alternatives = findSimilarAlternatives(input);
  const tier = deriveTier(ordered);
  const headline = buildHeadline(input.current.ticker, ordered, tier);
  const whyInteresting = buildWhyInteresting(ordered, alternatives);

  return {
    ticker: input.current.ticker,
    asOf: input.asOf,
    headline,
    tier,
    signals: ordered,
    alternatives,
    whyInteresting,
    sources: collectSources(input),
  };
}
