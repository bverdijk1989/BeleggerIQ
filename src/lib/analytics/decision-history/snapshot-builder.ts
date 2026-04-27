import type { DashboardAction } from "@/lib/analytics/actions";
import type { Currency } from "@/types/common";

import type { DecisionActionType, DecisionRecord, DecisionStatus } from "./types";

/**
 * Decision snapshot-builder — pure functie. Mapt de top-N
 * `DashboardAction[]` naar persistable input-rijen die de repository
 * kan opslaan.
 *
 * **Reproduceerbaar.** Wordt aangeroepen tijdens een dashboard-load
 * vóór de write naar Prisma. De repository gebruikt
 * `(userId, suggestedBucket, decisionKey)` als unique key zodat
 * herhaalde dashboard-loads niet steeds nieuwe records aanmaken.
 *
 * Niet voor display — UI-records komen uit de repository als
 * `DecisionRecord[]`.
 */

export interface BuildDecisionSnapshotInput {
  actions: DashboardAction[];
  baseCurrency: Currency;
  /** Override `now` voor tests. */
  now?: Date;
  /** TTL in dagen — default 14. Na deze periode kan de housekeeping
   *  job records auto-expiren. */
  ttlDays?: number;
}

export interface DecisionSnapshotInput {
  decisionKey: string;
  actionType: DecisionActionType;
  symbol: string | null;
  shares: number | null;
  amount: number | null;
  baseCurrency: Currency;
  title: string;
  rationale: string;
  confidence: number;
  sourceEngine: string;
  suggestedAt: Date;
  /** Begin van de uur-bucket — gebruikt voor idempotente upserts. */
  suggestedBucket: Date;
  expiresAt: Date;
}

export function buildDecisionSnapshots(
  input: BuildDecisionSnapshotInput,
): DecisionSnapshotInput[] {
  const now = input.now ?? new Date();
  const ttlDays = input.ttlDays ?? 14;
  const expires = new Date(now);
  expires.setDate(expires.getDate() + ttlDays);
  const bucket = bucketStart(now);

  return input.actions
    .filter((a) => a.type !== "DO_NOTHING")
    .map((a) => ({
      decisionKey: a.id,
      actionType: a.type,
      symbol: a.symbol ?? null,
      shares: typeof a.shares === "number" ? Math.round(a.shares) : null,
      amount: typeof a.amount === "number" ? roundCents(a.amount) : null,
      baseCurrency: input.baseCurrency,
      title: a.title,
      rationale: a.reason,
      confidence: clamp01(a.confidence),
      sourceEngine: a.sourceEngine,
      suggestedAt: now,
      suggestedBucket: bucket,
      expiresAt: expires,
    }));
}

/**
 * Vroeg de uur-bucket: zelfde uur → zelfde bucket → upsert mergt.
 */
export function bucketStart(now: Date): Date {
  const b = new Date(now);
  b.setMinutes(0, 0, 0);
  return b;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
}

function roundCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

// ============================================================
//  Status-helper (pure)
// ============================================================

/**
 * Bepaal of een status-transitie geldig is. Gebruikt door de API-route
 * voor input-validatie.
 *  - SUGGESTED → MARKED_DONE / IGNORED / EXPIRED
 *  - andere statussen zijn definitief; kunnen niet terug.
 */
export function isValidStatusTransition(
  from: DecisionStatus,
  to: DecisionStatus,
): boolean {
  if (from === to) return false;
  if (from !== "SUGGESTED") return false;
  return to === "MARKED_DONE" || to === "IGNORED" || to === "EXPIRED";
}
