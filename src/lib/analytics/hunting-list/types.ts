import type { Currency, ISODateString } from "@/types/common";
import type { WatchlistItem } from "@/types/watchlist";

/**
 * Hunting List types.
 *
 * De hunting-list is de actieve variant van de watchlist: naast "volg
 * deze ticker" bevat elk item triggers (target-zone, valuation-band)
 * die aangeven **wanneer** de ticker onderzoek waard is. Alle status-
 * en severity-waarden zijn discrete enums zodat de UI op codes kan
 * filteren i.p.v. op strings.
 *
 * Design-principes:
 *  - Pure engine: de detectoren zijn deterministische functies van
 *    prijs/fundamentals/config. Geen AI, geen willekeur.
 *  - Explainable: elke trigger draagt `rationale[]` en `riskNote`.
 *  - Signal-expiry: elke trigger krijgt een `firedAt` + `expiresAt`
 *    zodat oude triggers automatisch uit de actieve set vallen.
 *  - Opportunity-history: persistente log per fire zodat gebruikers
 *    "heeft deze trigger al eerder gevuurd?" kunnen zien.
 */

// ============================================================
//  Enums
// ============================================================

export const HUNTING_STATUSES = [
  "watching",
  "near-target",
  "signal-active",
  "expired",
] as const;

export type HuntingStatus = (typeof HUNTING_STATUSES)[number];

export const HUNTING_TRIGGER_TYPES = [
  "target-zone-reached",
  "target-zone-near",
  "valuation-band-reached",
] as const;

export type HuntingTriggerType = (typeof HUNTING_TRIGGER_TYPES)[number];

export const HUNTING_ALERT_SEVERITIES = [
  "NONE",
  "LOW",
  "MEDIUM",
  "HIGH",
] as const;

export type HuntingAlertSeverity = (typeof HUNTING_ALERT_SEVERITIES)[number];

// ============================================================
//  Trigger
// ============================================================

export interface HuntingTrigger {
  type: HuntingTriggerType;
  severity: HuntingAlertSeverity;
  rationale: string[];
  riskNote: string;
  firedAt: ISODateString;
  expiresAt: ISODateString;
  /**
   * Voor UI en logging: snapshot van de prijs/valuation-ratio die de
   * trigger deed afvuren. `null` bij missende data.
   */
  snapshot: {
    price: number | null;
    pe: number | null;
    fcfYield: number | null;
  };
}

// ============================================================
//  Geschiedenis-entry
// ============================================================

/**
 * Compact log-item voor de UI (niet 1:1 de Prisma row). De loader
 * transformeert `HuntingSignalLog` rows naar deze shape.
 */
export interface HuntingHistoryEntry {
  firedAt: ISODateString;
  triggerType: HuntingTriggerType;
  severity: HuntingAlertSeverity;
  price: number | null;
  note: string | null;
}

// ============================================================
//  Hunting-list-item
// ============================================================

export interface HuntingListItem {
  id: string;
  ticker: string;
  name: string;
  status: HuntingStatus;
  /** Max severity over actieve (niet-verlopen) triggers. */
  severity: HuntingAlertSeverity;
  /** Actieve + reeds verlopen triggers uit de meest recente scan. */
  triggers: HuntingTrigger[];
  currentPrice: number | null;
  currency: Currency | null;
  config: {
    targetPrice: number | null;
    targetPriceHigh: number | null;
    buyZoneTolerance: number;
    valuationMaxPE: number | null;
    valuationMinFcfYield: number | null;
  };
  note: string | null;
  addedAt: ISODateString;
  /** Eerder afgevuurde triggers (uit de persistente log). */
  history: HuntingHistoryEntry[];
  /** Expliciete data-quality meting voor de UI. */
  dataQuality: {
    hasQuote: boolean;
    hasFundamentals: boolean;
    hasTargetConfig: boolean;
    hasValuationConfig: boolean;
    warnings: string[];
  };
}

// ============================================================
//  Report
// ============================================================

export interface HuntingListReport {
  scannedAt: ISODateString;
  defaultSignalTtlDays: number;
  items: HuntingListItem[];
  /** Tellers over de getoonde items voor dashboard-widgets. */
  statusDistribution: Record<HuntingStatus, number>;
  severityDistribution: Record<HuntingAlertSeverity, number>;
  triggerDistribution: Record<HuntingTriggerType, number>;
}

// ============================================================
//  UI-labels (NL)
// ============================================================

export const HUNTING_STATUS_LABELS: Record<HuntingStatus, string> = {
  watching: "Observeren",
  "near-target": "In de buurt van target",
  "signal-active": "Signaal actief",
  expired: "Verlopen",
};

export const HUNTING_STATUS_DESCRIPTIONS: Record<HuntingStatus, string> = {
  watching:
    "Geen actieve trigger. Prijs of valuation zit nog niet in de buy-zone.",
  "near-target":
    "Prijs komt binnen tolerantie van target-zone; onderzoek bijtrekken aanbevolen.",
  "signal-active":
    "Een of meerdere triggers staan actief — serieuze koop-onderzoek-momenten.",
  expired:
    "Alle triggers zijn verlopen. Herzie de watchlist-parameters of wacht op nieuwe input.",
};

export const HUNTING_TRIGGER_LABELS: Record<HuntingTriggerType, string> = {
  "target-zone-reached": "Target-zone bereikt",
  "target-zone-near": "Dicht bij target",
  "valuation-band-reached": "Valuation-band bereikt",
};

export const HUNTING_SEVERITY_LABELS: Record<HuntingAlertSeverity, string> = {
  NONE: "Geen",
  LOW: "Laag",
  MEDIUM: "Medium",
  HIGH: "Hoog",
};

/**
 * Tier-orde voor severity-vergelijking. Hogere index = zwaarder.
 */
const SEVERITY_ORDER: Record<HuntingAlertSeverity, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export function maxSeverity(
  a: HuntingAlertSeverity,
  b: HuntingAlertSeverity,
): HuntingAlertSeverity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}

export function severityRank(severity: HuntingAlertSeverity): number {
  return SEVERITY_ORDER[severity];
}

// ============================================================
//  Config-helpers
// ============================================================

export const DEFAULT_BUY_ZONE_TOLERANCE = 0.05; // 5%
export const DEFAULT_TARGET_SIGNAL_TTL_DAYS = 14;
export const DEFAULT_VALUATION_SIGNAL_TTL_DAYS = 30;

/** Normaliseert `WatchlistItem` → `HuntingListItem["config"]`. */
export function resolveHuntingConfig(
  item: WatchlistItem,
): HuntingListItem["config"] {
  const tolerance = sanitizeFraction(
    item.buyZoneTolerance,
    DEFAULT_BUY_ZONE_TOLERANCE,
  );
  return {
    targetPrice: sanitizePositive(item.targetPrice),
    targetPriceHigh: sanitizePositive(item.targetPriceHigh),
    buyZoneTolerance: tolerance,
    valuationMaxPE: sanitizePositive(item.valuationMaxPE),
    valuationMinFcfYield: sanitizeFinite(item.valuationMinFcfYield),
  };
}

function sanitizePositive(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function sanitizeFinite(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function sanitizeFraction(
  value: number | null | undefined,
  fallback: number,
): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
