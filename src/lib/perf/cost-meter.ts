/**
 * Kosten-meter voor AI-aanroepen.
 *
 * **Probleem**: providers (Anthropic, OpenAI, ...) leveren `inputTokens` +
 * `outputTokens` mee in elke response. Maar deze tokens werden tot nu toe
 * NOOIT geaggregeerd — geen budget-zicht, geen alerting bij spend-spike.
 *
 * **Aanpak v1**: in-memory aggregator per scope (briefing, explainability,
 * dossier, chat, ...). Per call: `recordAICost(...)` → log-event + interne
 * counter. Dump van counters via `snapshotCostMeter()` — voor
 * `/admin/cost`-pagina of nightly-job die EUR-totalen naar audit-log schrijft.
 *
 * **Pricing**: lookup-table per provider × model. Cijfers stand-2025-12;
 * bumpen wanneer providers tarieven wijzigen.
 */

import { log } from "@/lib/log";

export type AIProviderName =
  | "anthropic"
  | "openai"
  | "azure-openai"
  | "noop"
  | "unknown";

/**
 * USD per 1M tokens. Approximation; productie: vervangen door provider-API
 * billing-call of nightly sync. **Niet** als bron voor klant-facturatie.
 */
const PRICING_USD_PER_1M_TOKENS: Record<
  AIProviderName,
  { input: number; output: number }
> = {
  anthropic: { input: 3.0, output: 15.0 }, // Claude Sonnet 4 ballpark
  openai: { input: 2.5, output: 10.0 }, // GPT-4o ballpark
  "azure-openai": { input: 2.5, output: 10.0 },
  noop: { input: 0, output: 0 },
  unknown: { input: 5.0, output: 20.0 }, // conservative fallback
};

const USD_TO_EUR = 0.93; // Vaste schatting; nightly-FX-sync is overkill voor v1.

export interface AICostEvent {
  provider: AIProviderName;
  model: string;
  /** Categorische scope ("briefing", "explainability", "dossier", "chat", "scenario"). */
  scope: string;
  inputTokens: number;
  outputTokens: number;
  /** Of dit een cache-hit was (dan zijn tokens 0 en kost 0 — getrackt
   *  voor savings-zicht). */
  cacheHit?: boolean;
  /** Optionele user-hash voor per-user-cost-attributie zonder PII. */
  userHash?: string | null;
}

export interface CostBreakdown {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  costEur: number;
  callCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
}

export interface CostSnapshot {
  windowStart: string;
  byScope: Record<string, CostBreakdown>;
  byProvider: Record<string, CostBreakdown>;
  total: CostBreakdown;
}

// ============================================================
//  In-memory aggregator
// ============================================================

let windowStart = new Date().toISOString();
const byScope: Map<string, CostBreakdown> = new Map();
const byProvider: Map<string, CostBreakdown> = new Map();
const total: CostBreakdown = empty();

function empty(): CostBreakdown {
  return {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    costEur: 0,
    callCount: 0,
    cacheHitCount: 0,
    cacheMissCount: 0,
  };
}

function add(target: CostBreakdown, delta: CostBreakdown): void {
  target.inputTokens += delta.inputTokens;
  target.outputTokens += delta.outputTokens;
  target.costUsd += delta.costUsd;
  target.costEur += delta.costEur;
  target.callCount += delta.callCount;
  target.cacheHitCount += delta.cacheHitCount;
  target.cacheMissCount += delta.cacheMissCount;
}

/**
 * Bereken kost-fractie. Pure functie; los testbaar.
 */
export function estimateCost(
  provider: AIProviderName,
  inputTokens: number,
  outputTokens: number,
): { usd: number; eur: number } {
  const rates = PRICING_USD_PER_1M_TOKENS[provider] ?? PRICING_USD_PER_1M_TOKENS.unknown;
  const usd =
    (inputTokens / 1_000_000) * rates.input +
    (outputTokens / 1_000_000) * rates.output;
  return { usd, eur: usd * USD_TO_EUR };
}

/**
 * Hoofd-emit. Logt structured event + update aggregator.
 */
export function recordAICost(event: AICostEvent): CostBreakdown {
  const cacheHit = event.cacheHit === true;
  const { usd, eur } = cacheHit
    ? { usd: 0, eur: 0 }
    : estimateCost(event.provider, event.inputTokens, event.outputTokens);

  const delta: CostBreakdown = {
    inputTokens: cacheHit ? 0 : event.inputTokens,
    outputTokens: cacheHit ? 0 : event.outputTokens,
    costUsd: usd,
    costEur: eur,
    callCount: 1,
    cacheHitCount: cacheHit ? 1 : 0,
    cacheMissCount: cacheHit ? 0 : 1,
  };

  add(total, delta);
  add(getOrInit(byScope, event.scope), delta);
  add(getOrInit(byProvider, event.provider), delta);

  log.info("metric:ai_cost", "ai_call", {
    metric: "ai_cost",
    provider: event.provider,
    model: event.model,
    scope: event.scope,
    inputTokens: delta.inputTokens,
    outputTokens: delta.outputTokens,
    costUsd: round4(usd),
    costEur: round4(eur),
    cacheHit,
    ...(event.userHash ? { userHash: event.userHash } : {}),
  });

  return delta;
}

function getOrInit(map: Map<string, CostBreakdown>, key: string): CostBreakdown {
  const existing = map.get(key);
  if (existing) return existing;
  const fresh = empty();
  map.set(key, fresh);
  return fresh;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Snapshot van de huidige aggregatie-state. Bedoeld voor:
 *  - `/admin/cost`-pagina (intern dashboard)
 *  - nightly job die snapshot naar audit-log schrijft + aggregator reset
 */
export function snapshotCostMeter(): CostSnapshot {
  return {
    windowStart,
    byScope: Object.fromEntries(
      [...byScope.entries()].map(([k, v]) => [k, { ...v }]),
    ),
    byProvider: Object.fromEntries(
      [...byProvider.entries()].map(([k, v]) => [k, { ...v }]),
    ),
    total: { ...total },
  };
}

/**
 * Reset aggregator — gebruik vanuit nightly job na snapshot.
 * Pure side-effect; geen return waarde.
 */
export function resetCostMeter(): void {
  windowStart = new Date().toISOString();
  byScope.clear();
  byProvider.clear();
  Object.assign(total, empty());
}
