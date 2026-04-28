/**
 * Pure event-generators voor notifications.
 *
 * **Geen DB-toegang, geen mail-client.** Elke generator krijgt z'n
 * input expliciet door — daarmee eenvoudig te unit-testen en
 * runtime-agnostisch (ook bruikbaar vanuit een Cloudflare Worker als
 * we ooit cross-platform willen).
 *
 * Convention voor `key`-vorming:
 *   - Stable per "real-world" gebeurtenis. Twee runs tegen dezelfde
 *     onderliggende staat moeten dezelfde key produceren — anders
 *     bypassed je de idempotency-laag.
 *   - Format: `<eventType>:<userId>:<bucket>:<salient>`
 *   - `<bucket>` = grovere tijds-grond (bv. "2026-04-28") zodat een
 *     dag-lange overschrijding één enkele alert oplevert i.p.v. zes
 *     per cron-tick.
 *
 * Severity:
 *   - "critical"   → instant-alert (subject: "Actie nodig")
 *   - "informational" → eindigt typisch in de wekelijkse digest
 */

export type NotificationEventType =
  | "NEW_RISK_FLAG"
  | "POSITION_CAP_EXCEEDED"
  | "FRAGILE_CONCENTRATION"
  | "REGIME_SWITCH"
  | "WATCHLIST_PRICE_ALERT";

export type NotificationSeverity = "critical" | "informational";

export interface NotificationEvent {
  /** Stabiele dedup-id binnen (userId, key). */
  key: string;
  type: NotificationEventType;
  severity: NotificationSeverity;
  userId: string;
  /** Eénregelige titel — gebruikt als subject + digest-bullet. */
  title: string;
  /** Volledige uitleg in plain text, 1–4 zinnen. */
  body: string;
  /** Vrije meta-bag voor templates (bv. ticker, regime). */
  context: Record<string, unknown>;
  /** ISO-timestamp wanneer de onderliggende gebeurtenis plaatsvond. */
  occurredAt: string;
}

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

// ============================================================
//  Risk-flag detector
// ============================================================

export interface RiskFlag {
  ticker: string;
  reason: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface DetectNewRiskFlagsInput {
  userId: string;
  /** Risk-flags geactiveerd in de laatste run. */
  current: RiskFlag[];
  /** Risk-flags actief in de vorige run (om diff te bepalen). */
  previous: RiskFlag[];
  occurredAt: Date;
}

function flagKey(f: RiskFlag): string {
  return `${f.ticker}|${f.reason}`;
}

export function detectNewRiskFlags(
  input: DetectNewRiskFlagsInput,
): NotificationEvent[] {
  const seen = new Set(input.previous.map(flagKey));
  const events: NotificationEvent[] = [];
  const day = isoDay(input.occurredAt);
  for (const flag of input.current) {
    const k = flagKey(flag);
    if (seen.has(k)) continue;
    if (flag.severity === "LOW") continue; // alleen MEDIUM+ wekt een alert
    events.push({
      type: "NEW_RISK_FLAG",
      severity: flag.severity === "HIGH" ? "critical" : "informational",
      userId: input.userId,
      key: `NEW_RISK_FLAG:${input.userId}:${day}:${flag.ticker}:${flag.reason}`,
      title: `Nieuwe ${flag.severity}-risk-flag op ${flag.ticker}`,
      body: `${flag.ticker}: ${flag.reason}`,
      context: { ticker: flag.ticker, reason: flag.reason, severity: flag.severity },
      occurredAt: input.occurredAt.toISOString(),
    });
  }
  return events;
}

// ============================================================
//  Position-cap detector
// ============================================================

export interface PositionWithCap {
  ticker: string;
  weight: number; // fractie 0..1
  cap: number; // fractie 0..1
}

export interface DetectCapExceededInput {
  userId: string;
  positions: PositionWithCap[];
  occurredAt: Date;
}

export function detectPositionCapExceeded(
  input: DetectCapExceededInput,
): NotificationEvent[] {
  const events: NotificationEvent[] = [];
  const day = isoDay(input.occurredAt);
  for (const p of input.positions) {
    if (p.cap <= 0) continue;
    const ratio = p.weight / p.cap;

    if (ratio > 2) {
      // Fragile concentration — apart event-type met hogere severity.
      events.push({
        type: "FRAGILE_CONCENTRATION",
        severity: "critical",
        userId: input.userId,
        key: `FRAGILE_CONCENTRATION:${input.userId}:${day}:${p.ticker}`,
        title: `Fragiele concentratie: ${p.ticker} > 2× je cap`,
        body: `${p.ticker} weegt ${(p.weight * 100).toFixed(1)}% versus je cap van ${(p.cap * 100).toFixed(1)}%. Dat is meer dan dubbel je toegestane gewicht en vergroot je single-name-risico fors.`,
        context: { ticker: p.ticker, weight: p.weight, cap: p.cap, ratio },
        occurredAt: input.occurredAt.toISOString(),
      });
      continue;
    }
    if (ratio > 1) {
      events.push({
        type: "POSITION_CAP_EXCEEDED",
        severity: "informational",
        userId: input.userId,
        key: `POSITION_CAP_EXCEEDED:${input.userId}:${day}:${p.ticker}`,
        title: `${p.ticker} boven je positie-cap`,
        body: `${p.ticker} weegt ${(p.weight * 100).toFixed(1)}% — boven je ingestelde cap van ${(p.cap * 100).toFixed(1)}%. Overweeg trim bij rebalance.`,
        context: { ticker: p.ticker, weight: p.weight, cap: p.cap, ratio },
        occurredAt: input.occurredAt.toISOString(),
      });
    }
  }
  return events;
}

// ============================================================
//  Regime-switch detector
// ============================================================

export type RegimeLabel =
  | "EXPANSION"
  | "SLOWDOWN"
  | "RECESSION"
  | "RECOVERY"
  | "UNKNOWN";

export interface DetectRegimeSwitchInput {
  userId: string;
  previous: RegimeLabel | null;
  current: RegimeLabel;
  occurredAt: Date;
}

export function detectRegimeSwitch(
  input: DetectRegimeSwitchInput,
): NotificationEvent[] {
  if (
    input.previous === input.current ||
    input.previous === null ||
    input.current === "UNKNOWN" ||
    input.previous === "UNKNOWN"
  ) {
    return [];
  }
  const day = isoDay(input.occurredAt);
  return [
    {
      type: "REGIME_SWITCH",
      severity: "critical",
      userId: input.userId,
      // Per-DAG dedup zodat een wiggling regime-engine niet 8 alerts/dag stuurt.
      key: `REGIME_SWITCH:${input.userId}:${day}:${input.previous}:${input.current}`,
      title: `Marktregime: ${input.previous} → ${input.current}`,
      body: `Het regime-model wisselt van ${input.previous} naar ${input.current}. Lees de regime-narrative op /dashboard voor de aanbevolen tilt.`,
      context: {
        regimeBefore: input.previous,
        regimeAfter: input.current,
      },
      occurredAt: input.occurredAt.toISOString(),
    },
  ];
}

// ============================================================
//  Watchlist price-alert detector
// ============================================================

export interface WatchlistPriceCheck {
  watchlistItemId: string;
  ticker: string;
  currentPrice: number;
  currency: string | null;
  /** Onderdrempel — bij prijs ≤ low → ALERT_LOW. */
  targetLow: number | null;
  /** Bovendrempel — bij prijs ≥ high → ALERT_HIGH (optioneel). */
  targetHigh: number | null;
}

export interface DetectWatchlistAlertsInput {
  userId: string;
  checks: WatchlistPriceCheck[];
  occurredAt: Date;
}

export function detectWatchlistPriceAlerts(
  input: DetectWatchlistAlertsInput,
): NotificationEvent[] {
  const events: NotificationEvent[] = [];
  const day = isoDay(input.occurredAt);

  for (const c of input.checks) {
    if (c.targetLow !== null && c.currentPrice <= c.targetLow) {
      events.push({
        type: "WATCHLIST_PRICE_ALERT",
        severity: "informational",
        userId: input.userId,
        key: `WATCHLIST_PRICE_ALERT:${input.userId}:${day}:${c.ticker}:LOW:${c.targetLow}`,
        title: `${c.ticker} onder je koop-zone`,
        body: `${c.ticker} staat op ${c.currentPrice}${c.currency ? ` ${c.currency}` : ""} — je had ≤ ${c.targetLow} ingesteld. Tijd om je thesis te checken.`,
        context: {
          ticker: c.ticker,
          watchlistItemId: c.watchlistItemId,
          currentPrice: c.currentPrice,
          threshold: c.targetLow,
          direction: "BELOW",
          currency: c.currency,
        },
        occurredAt: input.occurredAt.toISOString(),
      });
      continue; // niet ook nog HIGH-alert checken in dezelfde tick
    }
    if (c.targetHigh !== null && c.currentPrice >= c.targetHigh) {
      events.push({
        type: "WATCHLIST_PRICE_ALERT",
        severity: "informational",
        userId: input.userId,
        key: `WATCHLIST_PRICE_ALERT:${input.userId}:${day}:${c.ticker}:HIGH:${c.targetHigh}`,
        title: `${c.ticker} boven je signaal-niveau`,
        body: `${c.ticker} staat op ${c.currentPrice}${c.currency ? ` ${c.currency}` : ""} — je had ≥ ${c.targetHigh} ingesteld.`,
        context: {
          ticker: c.ticker,
          watchlistItemId: c.watchlistItemId,
          currentPrice: c.currentPrice,
          threshold: c.targetHigh,
          direction: "ABOVE",
          currency: c.currency,
        },
        occurredAt: input.occurredAt.toISOString(),
      });
    }
  }
  return events;
}

// ============================================================
//  Helper — categorie-mapping voor preferences
// ============================================================

export function categoryOf(
  type: NotificationEventType,
): "critical" | "watchlist" {
  return type === "WATCHLIST_PRICE_ALERT" ? "watchlist" : "critical";
}
