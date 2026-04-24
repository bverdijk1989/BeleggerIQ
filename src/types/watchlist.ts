import type { ISODateString } from "./common";

/**
 * Watchlist-item: een ticker die de user volgt maar (nog) niet bezit.
 * `targetPrice` is optioneel en dient voor een price-alert flow.
 */
export interface WatchlistItem {
  id: string;
  userId: string;
  ticker: string;
  name?: string | null;
  note?: string | null;
  targetPrice?: number | null;
  addedAt: ISODateString;
  updatedAt: ISODateString;
}
