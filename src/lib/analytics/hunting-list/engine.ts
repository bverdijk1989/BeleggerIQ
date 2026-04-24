import type { FundamentalsSnapshot } from "@/types/factor";
import type { Quote } from "@/types/market";
import type { WatchlistItem } from "@/types/watchlist";

import { isTriggerExpired, partitionTriggers } from "./expiry";
import { detectTargetZone } from "./target-zone";
import {
  HUNTING_ALERT_SEVERITIES,
  HUNTING_STATUSES,
  HUNTING_TRIGGER_TYPES,
  maxSeverity,
  resolveHuntingConfig,
  severityRank,
  type HuntingAlertSeverity,
  type HuntingHistoryEntry,
  type HuntingListItem,
  type HuntingListReport,
  type HuntingStatus,
  type HuntingTrigger,
  type HuntingTriggerType,
} from "./types";
import { detectValuationBand } from "./valuation-band";

/**
 * Hunting-list trigger-engine.
 *
 * Pure functie: `evaluateHuntingList(input)` neemt alle watchlist-items
 * van een user + hun quote/fundamentals/history en levert een
 * `HuntingListReport` op. Geen I/O, geen database, geen clock-gok
 * buiten de optionele `config.now` override.
 *
 * Status-afleiding (priority-regels):
 *   1. Als één van de actieve triggers een `target-zone-reached` of
 *      `valuation-band-reached` met severity ≥ MEDIUM is →
 *      `signal-active`.
 *   2. Anders, als er een actieve `target-zone-near` (LOW) of andere
 *      LOW-trigger is → `near-target`.
 *   3. Anders, als alle triggers voor dit item verlopen zijn → `expired`.
 *   4. Anders → `watching`.
 */

// ============================================================
//  Input
// ============================================================

export interface HuntingListDataEntry {
  item: WatchlistItem;
  quote: Quote | null;
  fundamentals: FundamentalsSnapshot | null;
  /** Per-ticker history uit de HuntingSignalLog (meest recent eerst). */
  history: HuntingHistoryEntry[];
}

export interface EvaluateHuntingListInput {
  entries: HuntingListDataEntry[];
  config?: {
    /** Override voor deterministische tests. */
    now?: string;
    /** TTL voor target-zone signalen (default 14 dagen). */
    targetSignalTtlDays?: number;
    /** TTL voor valuation-band signalen (default 30 dagen). */
    valuationSignalTtlDays?: number;
  };
}

// ============================================================
//  Public fn
// ============================================================

export function evaluateHuntingList(
  input: EvaluateHuntingListInput,
): HuntingListReport {
  const config = input.config ?? {};
  const now = config.now ?? new Date().toISOString();

  const items = input.entries.map((entry) => evaluateEntry(entry, config, now));

  const statusDistribution = emptyCounter<HuntingStatus>(HUNTING_STATUSES);
  const severityDistribution = emptyCounter<HuntingAlertSeverity>(
    HUNTING_ALERT_SEVERITIES,
  );
  const triggerDistribution = emptyCounter<HuntingTriggerType>(
    HUNTING_TRIGGER_TYPES,
  );

  for (const i of items) {
    statusDistribution[i.status] += 1;
    severityDistribution[i.severity] += 1;
    for (const t of i.triggers) {
      if (!isTriggerExpired(t, now)) triggerDistribution[t.type] += 1;
    }
  }

  // Sorteer op severity desc, dan alfabetisch op ticker.
  const sorted = [...items].sort((a, b) => {
    const sa = severityRank(a.severity);
    const sb = severityRank(b.severity);
    if (sa !== sb) return sb - sa;
    return a.ticker.localeCompare(b.ticker);
  });

  return {
    scannedAt: now,
    defaultSignalTtlDays: config.targetSignalTtlDays ?? 14,
    items: sorted,
    statusDistribution,
    severityDistribution,
    triggerDistribution,
  };
}

// ============================================================
//  Per-item evaluatie
// ============================================================

function evaluateEntry(
  entry: HuntingListDataEntry,
  config: NonNullable<EvaluateHuntingListInput["config"]>,
  now: string,
): HuntingListItem {
  const { item, quote, fundamentals, history } = entry;
  const resolvedConfig = resolveHuntingConfig(item);
  const currentPrice = quote?.price ?? null;
  const currency = quote?.currency ?? null;

  const triggers: HuntingTrigger[] = [];

  const targetTrigger = detectTargetZone({
    currentPrice,
    targetPrice: resolvedConfig.targetPrice,
    targetPriceHigh: resolvedConfig.targetPriceHigh,
    buyZoneTolerance: resolvedConfig.buyZoneTolerance,
    pe: fundamentals?.pe ?? null,
    fcfYield: fundamentals?.fcfYield ?? null,
    now,
    ttlDays: config.targetSignalTtlDays,
  });
  if (targetTrigger) triggers.push(targetTrigger);

  const valuationTrigger = detectValuationBand({
    fundamentals,
    valuationMaxPE: resolvedConfig.valuationMaxPE,
    valuationMinFcfYield: resolvedConfig.valuationMinFcfYield,
    price: currentPrice,
    now,
    ttlDays: config.valuationSignalTtlDays,
  });
  if (valuationTrigger) triggers.push(valuationTrigger);

  const { active, expired } = partitionTriggers(triggers, now);
  const status = deriveStatus({ active, expired, history, now });
  const severity = deriveSeverity(active);

  const hasTargetConfig =
    resolvedConfig.targetPrice !== null || resolvedConfig.targetPriceHigh !== null;
  const hasValuationConfig =
    resolvedConfig.valuationMaxPE !== null ||
    resolvedConfig.valuationMinFcfYield !== null;

  const warnings = collectWarnings({
    hasQuote: currentPrice !== null,
    hasFundamentals: fundamentals !== null,
    hasTargetConfig,
    hasValuationConfig,
  });

  return {
    id: item.id,
    ticker: item.ticker,
    name: item.name ?? item.ticker,
    status,
    severity,
    triggers: sortTriggers(triggers, now),
    currentPrice,
    currency,
    config: resolvedConfig,
    note: item.note ?? null,
    addedAt: item.addedAt,
    history,
    dataQuality: {
      hasQuote: currentPrice !== null,
      hasFundamentals: fundamentals !== null,
      hasTargetConfig,
      hasValuationConfig,
      warnings,
    },
  };
}

// ============================================================
//  Status + severity-afleiding
// ============================================================

function deriveStatus(params: {
  active: HuntingTrigger[];
  expired: HuntingTrigger[];
  history: HuntingHistoryEntry[];
  now: string;
}): HuntingStatus {
  const { active, expired, history } = params;

  // 1. Actieve trigger met severity ≥ MEDIUM → signal-active.
  if (active.some((t) => severityRank(t.severity) >= severityRank("MEDIUM"))) {
    return "signal-active";
  }
  // 2. Actieve LOW-trigger (bv. target-zone-near) → near-target.
  if (active.some((t) => severityRank(t.severity) >= severityRank("LOW"))) {
    return "near-target";
  }
  // 3. Geen active, wel recent expired (of persistent history entries)?
  //    → expired.
  if (expired.length > 0) return "expired";
  if (history.length > 0) {
    // Alle historische triggers liggen vóór "now"; expired.
    return "expired";
  }
  // 4. Default.
  return "watching";
}

function deriveSeverity(
  active: HuntingTrigger[],
): HuntingAlertSeverity {
  let severity: HuntingAlertSeverity = "NONE";
  for (const t of active) severity = maxSeverity(severity, t.severity);
  return severity;
}

// ============================================================
//  Helpers
// ============================================================

function sortTriggers(triggers: HuntingTrigger[], now: string): HuntingTrigger[] {
  return [...triggers].sort((a, b) => {
    const aExpired = isTriggerExpired(a, now);
    const bExpired = isTriggerExpired(b, now);
    if (aExpired !== bExpired) return aExpired ? 1 : -1;
    const sa = severityRank(a.severity);
    const sb = severityRank(b.severity);
    if (sa !== sb) return sb - sa;
    return a.type.localeCompare(b.type);
  });
}

function collectWarnings(params: {
  hasQuote: boolean;
  hasFundamentals: boolean;
  hasTargetConfig: boolean;
  hasValuationConfig: boolean;
}): string[] {
  const out: string[] = [];
  if (!params.hasQuote) out.push("Geen actuele koers — triggers uitgeschakeld.");
  if (!params.hasTargetConfig && !params.hasValuationConfig) {
    out.push(
      "Geen target-zone of valuation-band geconfigureerd — item blijft op watching.",
    );
  }
  if (params.hasValuationConfig && !params.hasFundamentals) {
    out.push(
      "Valuation-band geconfigureerd, maar fundamentals ontbreken — valuation-trigger slaapt.",
    );
  }
  return out;
}

function emptyCounter<K extends string>(keys: readonly K[]): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = 0;
  return out;
}
