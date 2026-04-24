import type { ISODateString } from "./common";

/**
 * Hunting-list-item: een ticker die de user volgt (voorheen
 * "watchlist-item") met optionele target-zone + valuation-band config
 * zodat de hunting-list engine aan kan geven **wanneer** de ticker
 * koopwaardig onderzocht moet worden.
 *
 * Backwards-compatible: alleen `ticker`/`addedAt`/`updatedAt` zijn
 * verplicht; alle andere velden zijn optioneel en mogen `null` zijn
 * wanneer de gebruiker ze niet heeft ingesteld.
 */
export interface WatchlistItem {
  id: string;
  userId: string;
  ticker: string;
  name?: string | null;
  note?: string | null;
  /** Ondergrens target-zone / primaire buy-drempel. */
  targetPrice?: number | null;
  /** Bovengrens target-zone (optioneel — definieert een band i.p.v. punt). */
  targetPriceHigh?: number | null;
  /**
   * Fractie (bv. 0.05 = 5%) gebruikt voor `target-zone-near`-detectie
   * wanneer geen expliciete bandbovenzijde is opgegeven. Default 0.05.
   */
  buyZoneTolerance?: number | null;
  /** User-gedefinieerde P/E-bovengrens voor valuation-band trigger. */
  valuationMaxPE?: number | null;
  /** User-gedefinieerde FCF-yield-ondergrens voor valuation-band trigger. */
  valuationMinFcfYield?: number | null;
  addedAt: ISODateString;
  updatedAt: ISODateString;
}
