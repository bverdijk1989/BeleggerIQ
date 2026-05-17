/**
 * Alerts engine — types.
 *
 * **In-app notification center** (los van outbound e-mail/digest in
 * `src/lib/notifications/`). Tien alert-typen, drie severity-niveaus,
 * read/unread/dismissed-state per alert.
 *
 * **Topbelegger-laag**:
 *  - Buffett: minimaliseer ruis. Drempels zijn streng (geen 1%-bewegingen).
 *  - Dalio: regime-shifts en concentratie zijn zwaarder.
 *  - Lynch: titels en bodies in spreektaal NL.
 *  - Simons: drempels zijn `const`; pure-functie generators; tests dekken
 *    elke trigger.
 *  - Wood: AI Briefing wordt zelf een alert-type wanneer beschikbaar.
 */

import type { ISODateString } from "@/types/common";

/** 11 alert-typen — 10 Module 10-spec + bonus VALUATION_SIGNAL. */
export type AlertType =
  | "HEALTH_DROP"
  | "CONCENTRATION_RISING"
  | "PRICE_MOVE"
  | "MACRO_REGIME_CHANGE"
  | "BEHAVIORAL_WARNING"
  | "EARNINGS_EVENT"
  | "DIVIDEND_EVENT"
  | "WATCHLIST_OPPORTUNITY"
  | "VALUATION_SIGNAL"
  | "DATA_QUALITY_LOW"
  | "AI_BRIEFING_READY";

export type AlertSeverity = "INFO" | "WARNING" | "CRITICAL";

export type AlertStatus = "UNREAD" | "READ" | "DISMISSED";

/**
 * **Candidate** — wat een generator produceert. Wordt door de service
 * ge-dedupliceerd op `dedupeKey` voordat 'em in de DB belandt.
 */
export interface AlertCandidate {
  type: AlertType;
  severity: AlertSeverity;
  /** Stabiele dedup-id binnen (userId, dedupeKey). */
  dedupeKey: string;
  /** Eénregelige NL-titel. */
  title: string;
  /** 1–3 zinnen NL plain text. */
  body: string;
  /** Vrije meta-bag — voor templates en deeplinks. */
  context?: Record<string, unknown>;
  /** Optionele app-route waar de gebruiker direct heen kan. */
  link?: string;
  /** ISO wanneer onderliggende gebeurtenis plaatsvond. */
  occurredAt: ISODateString;
}

/**
 * **Persisted** — wat in de DB staat en in de UI verschijnt.
 * Heeft id + status + read/dismiss-timestamps.
 */
export interface Alert extends AlertCandidate {
  id: string;
  userId: string;
  status: AlertStatus;
  readAt: ISODateString | null;
  dismissedAt: ISODateString | null;
  createdAt: ISODateString;
}

// ============================================================
//  Per-type catalog
// ============================================================

export type AlertCategory =
  | "portfolio"
  | "risk"
  | "market"
  | "behavioral"
  | "events"
  | "ai";

export interface AlertTypeDefinition {
  type: AlertType;
  /** UI-label NL. */
  label: string;
  /** 1-zin uitleg voor de preferences-pagina. */
  description: string;
  /** Default severity wanneer een generator niets specifieks zet. */
  defaultSeverity: AlertSeverity;
  /** Default opt-in (true = aan voor nieuwe gebruikers). */
  defaultEnabled: boolean;
  /** Gegroepeerd in de UI per categorie. */
  category: AlertCategory;
}
