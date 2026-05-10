/**
 * Macro data provider abstractie.
 *
 * **Doel**: één interface tussen de classifier en concrete data-bronnen
 * (DB-snapshot, FRED, ECB SDW, Bloomberg, eigen ML-forecast). Zwaarder
 * dan een paar hardgecodeerde fields, maar goedkoper dan ze later moeten
 * vervangen.
 *
 * **Faal-safe contract**: een provider mag voor elke indicator `null`
 * teruggeven; de classifier rekent met partiële data en lager confidence.
 * Een provider mag NOOIT throw'en uit `fetch()`.
 */

import type { ISODateString } from "@/types/common";

import type { MacroIndicatorKey, MacroTrend } from "../types";

export type MacroProviderId = "seed" | "snapshot" | "composite";

/**
 * Eén indicator-meting in raw form. De classifier doet het normaliseren
 * naar score/rationale; de provider zorgt alleen voor de cijfers.
 */
export interface RawMacroIndicator {
  key: MacroIndicatorKey;
  /** Ruwe waarde — semantiek per indicator. */
  value: number | null;
  /** Tijdsperiode delta, voor trend-bepaling. Mag null zijn. */
  previousValue: number | null;
  /** Trend (afgeleid uit value/previousValue, of door provider-geleverd). */
  trend: MacroTrend;
  /** ISO-datum waarop de meting hoort. */
  asOf: ISODateString;
  /** Bron-identifier voor audit. */
  source: string;
  /** 0..1 — hoe betrouwbaar acht de provider deze meting. */
  confidence: number;
}

export interface MacroDataSnapshot {
  /** ISO-datum van het sample (typisch nu of de meest recente data). */
  asOf: ISODateString;
  providerId: MacroProviderId;
  indicators: RawMacroIndicator[];
}

export interface MacroDataProvider {
  readonly id: MacroProviderId;
  /** Eén-shot fetch — geen streaming. Mag NOOIT throw'en. */
  fetch(): Promise<MacroDataSnapshot>;
}
