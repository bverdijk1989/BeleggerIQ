/**
 * Event-types voor de watchlist.
 *
 * Voorbereiding op Module 12 (notifications). De daadwerkelijke
 * delivery-laag (email / push / in-app) wordt later toegevoegd; deze
 * module definieert al een **stabiel contract** zodat:
 *
 *   - de price-alert engine straks events met een herkenbaar `type` kan
 *     publiceren (`WATCHLIST_PRICE_ALERT`);
 *   - de UI/repository nu al weet welke triggers we ondersteunen (en de
 *     enum hier wordt de single-source-of-truth).
 *
 * Geen runtime-gedrag in deze file — alleen types + constants.
 */

export type WatchlistEventType =
  | "WATCHLIST_PRICE_ALERT"
  | "WATCHLIST_TARGET_ZONE_REACHED"
  | "WATCHLIST_VALUATION_BAND_REACHED";

/**
 * Payload-shape voor een gepubliceerde alert. Module 12 gaat dit in
 * een outbox-tabel wegschrijven; voor nu is het de signature waar
 * caller-code tegen kan typen.
 */
export interface WatchlistPriceAlertPayload {
  type: "WATCHLIST_PRICE_ALERT";
  userId: string;
  watchlistItemId: string;
  ticker: string;
  /** ISO-8601 wanneer de threshold geraakt werd. */
  triggeredAt: string;
  /** De prijs die de threshold raakte. */
  price: number;
  currency: string | null;
  /** Direction relative to the configured threshold. */
  direction: "ABOVE" | "BELOW";
  /** De configureerde threshold zelf (uit `WatchlistItem.targetPrice`). */
  threshold: number;
  rationale: string;
}

export const WATCHLIST_PRICE_ALERT_VERSION = 1 as const;
