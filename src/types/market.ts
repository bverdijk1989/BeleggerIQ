import type { Currency, ISODateString } from "./common";

/**
 * Genormaliseerde realtime/delayed quote. Providers mappen hun eigen
 * shape hier naartoe zodat analytics en UI consistent blijven werken.
 */
export interface Quote {
  ticker: string;
  price: number;
  currency: Currency;
  /** Absolute prijsverandering t.o.v. vorige close. */
  change?: number;
  /** Relatieve verandering als fractie, bv. 0.012 = +1,2%. */
  changePct?: number;
  dayHigh?: number;
  dayLow?: number;
  volume?: number;
  asOf: ISODateString;
  source?: string;
}

/**
 * Wisselkoers. `rate` is "hoeveel `to` krijg je voor 1 `from`" —
 * dus EUR→USD 1.08 betekent 1 EUR = 1.08 USD.
 */
export interface FxRate {
  from: Currency;
  to: Currency;
  rate: number;
  asOf: ISODateString;
  source?: string;
}

export type HistoryInterval = "1d" | "1wk" | "1mo";

export interface HistoricalPoint {
  date: ISODateString;
  open?: number;
  high?: number;
  low?: number;
  close: number;
  adjustedClose?: number;
  volume?: number;
}

export interface HistoryRequest {
  ticker: string;
  startDate: ISODateString;
  endDate: ISODateString;
  interval?: HistoryInterval;
}
