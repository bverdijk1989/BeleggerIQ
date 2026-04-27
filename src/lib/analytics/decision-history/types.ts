import type { DashboardActionType } from "@/lib/analytics/actions";
import type { Currency, ISODateString } from "@/types/common";

/**
 * Decision History — types.
 *
 * Houd in dezelfde namespace de Prisma-enum-string-typen, zodat de UI
 * en de aggregator dezelfde shape gebruiken zonder een Prisma-import in
 * client-componenten te trekken.
 */

export type DecisionStatus =
  | "SUGGESTED"
  | "MARKED_DONE"
  | "IGNORED"
  | "EXPIRED";

export type DecisionActionType = DashboardActionType;

export interface DecisionRecord {
  id: string;
  decisionKey: string;
  suggestedAt: ISODateString;
  expiresAt: ISODateString;
  actionType: DecisionActionType;
  symbol: string | null;
  shares: number | null;
  amount: number | null;
  baseCurrency: Currency;
  title: string;
  rationale: string | null;
  /** 0..1. */
  confidence: number;
  sourceEngine: string;
  status: DecisionStatus;
  statusUpdatedAt: ISODateString;
  statusNote: string | null;
}

/**
 * Compacte rolup voor de dashboard-preview.
 *  - `total`              — totaal aantal records (alle statussen).
 *  - `bucketCounts`       — # per status, voor de kop-pillen.
 *  - `recent`             — top-3 meest recente records.
 *  - `actionableCount`    — # records dat nog `SUGGESTED` is en niet
 *                           verlopen — gebruiker kan hierop klikken.
 */
export interface DecisionHistorySummary {
  total: number;
  bucketCounts: Record<DecisionStatus, number>;
  recent: DecisionRecord[];
  actionableCount: number;
  /** Eén-zin samenvatting voor de UI ("3 adviezen zichtbaar, 2 actief, 1 uitgevoerd"). */
  headline: string;
}
