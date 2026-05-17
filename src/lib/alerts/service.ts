/**
 * Alerts service — orchestrator.
 *
 * Stappen:
 *  1. Roep alle 10 generators aan met de relevante input.
 *  2. Filter candidates op user-preferences (`shouldDeliverAlert`).
 *  3. Dedupe op `dedupeKey` binnen één run (defensive — generators zijn
 *     al unique per dedupeKey, maar dubbele input kan dat omzeilen).
 *  4. Persist via `alertRepository.persistCandidates` (idempotent upsert).
 *
 * Pure-functie laag voor de generators; deze service-laag IS server-side
 * (DB-write).
 */

import {
  generateAiBriefingReadyAlerts,
  generateBehavioralAlerts,
  generateConcentrationAlerts,
  generateDataQualityAlerts,
  generateDividendEventAlerts,
  generateEarningsEventAlerts,
  generateHealthDropAlerts,
  generateMacroRegimeChangeAlerts,
  generatePriceMoveAlerts,
  generateValuationSignalAlerts,
  generateWatchlistAlerts,
  type AiBriefingReadyInput,
  type BehavioralWarningInput,
  type ConcentrationRisingInput,
  type DataQualityLowInput,
  type DividendEventInput,
  type EarningsEventInput,
  type HealthDropInput,
  type MacroRegimeChangeInput,
  type PriceMoveInput,
  type ValuationSignalInput,
  type WatchlistOpportunityInput,
} from "./generators";
import {
  buildDefaultAlertPreferences,
  shouldDeliverAlert,
  type AlertPreferences,
} from "./preferences";
import type { AlertCandidate } from "./types";

export interface AlertsRunInput {
  userId: string;
  preferences?: AlertPreferences;

  /** Inputs per generator. Een ontbrekende input → die generator wordt
   *  overgeslagen. Volledig null = geen alerts gegenereerd voor deze run. */
  health?: Omit<HealthDropInput, "userId"> | null;
  concentration?: Omit<ConcentrationRisingInput, "userId"> | null;
  priceMove?: Omit<PriceMoveInput, "userId"> | null;
  macroRegime?: Omit<MacroRegimeChangeInput, "userId"> | null;
  behavioral?: Omit<BehavioralWarningInput, "userId"> | null;
  earnings?: Omit<EarningsEventInput, "userId"> | null;
  dividend?: Omit<DividendEventInput, "userId"> | null;
  watchlist?: Omit<WatchlistOpportunityInput, "userId"> | null;
  valuation?: Omit<ValuationSignalInput, "userId"> | null;
  dataQuality?: Omit<DataQualityLowInput, "userId"> | null;
  briefing?: Omit<AiBriefingReadyInput, "userId"> | null;
}

export interface AlertsRunResult {
  /** Candidates die door de generators zijn geproduceerd. */
  generated: AlertCandidate[];
  /** Candidates die de prefs-filter doorstaan hebben. */
  delivered: AlertCandidate[];
  /** Aantal gefilterd op preferences (enabled/min-severity). */
  filteredOut: number;
}

/**
 * **Pure functie**: levert candidates + filter-uitkomst, ZONDER te
 * persisten. Caller (`runAlertsForUser`) wrapt dit met DB-writes.
 *
 * Geschikt voor tests — geen DB-mocking nodig.
 */
export function evaluateAlerts(
  input: AlertsRunInput,
): AlertsRunResult {
  const prefs = input.preferences ?? buildDefaultAlertPreferences();
  const generated: AlertCandidate[] = [];

  if (input.health) {
    generated.push(
      ...generateHealthDropAlerts({ userId: input.userId, ...input.health }),
    );
  }
  if (input.concentration) {
    generated.push(
      ...generateConcentrationAlerts({
        userId: input.userId,
        ...input.concentration,
      }),
    );
  }
  if (input.priceMove) {
    generated.push(
      ...generatePriceMoveAlerts({ userId: input.userId, ...input.priceMove }),
    );
  }
  if (input.macroRegime) {
    generated.push(
      ...generateMacroRegimeChangeAlerts({
        userId: input.userId,
        ...input.macroRegime,
      }),
    );
  }
  if (input.behavioral) {
    generated.push(
      ...generateBehavioralAlerts({
        userId: input.userId,
        ...input.behavioral,
      }),
    );
  }
  if (input.earnings) {
    generated.push(
      ...generateEarningsEventAlerts({
        userId: input.userId,
        ...input.earnings,
      }),
    );
  }
  if (input.dividend) {
    generated.push(
      ...generateDividendEventAlerts({
        userId: input.userId,
        ...input.dividend,
      }),
    );
  }
  if (input.watchlist) {
    generated.push(
      ...generateWatchlistAlerts({
        userId: input.userId,
        ...input.watchlist,
      }),
    );
  }
  if (input.valuation) {
    generated.push(
      ...generateValuationSignalAlerts({
        userId: input.userId,
        ...input.valuation,
      }),
    );
  }
  if (input.dataQuality) {
    generated.push(
      ...generateDataQualityAlerts({
        userId: input.userId,
        ...input.dataQuality,
      }),
    );
  }
  if (input.briefing) {
    generated.push(
      ...generateAiBriefingReadyAlerts({
        userId: input.userId,
        ...input.briefing,
      }),
    );
  }

  // Defensive in-run dedupe (generators kunnen tegelijk run-input zien).
  const seen = new Set<string>();
  const unique: AlertCandidate[] = [];
  for (const c of generated) {
    if (seen.has(c.dedupeKey)) continue;
    seen.add(c.dedupeKey);
    unique.push(c);
  }

  // Filter op preferences.
  const delivered: AlertCandidate[] = [];
  for (const c of unique) {
    if (shouldDeliverAlert(prefs, c.type, c.severity)) {
      delivered.push(c);
    }
  }
  const filteredOut = unique.length - delivered.length;

  return {
    generated: unique,
    delivered,
    filteredOut,
  };
}
