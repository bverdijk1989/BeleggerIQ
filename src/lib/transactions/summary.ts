/**
 * Per-jaar samenvatting van transacties.
 *
 * Aggregeert per jaar (UTC kalenderjaar):
 *   - realized PnL (per currency, summed across all tickers via FIFO)
 *   - dividend bruto-totaal
 *   - withholding-tax totaal
 *   - fees totaal
 *   - interest totaal
 *   - aantal trades
 *
 * Pure functie. Caller laadt de Transaction-rijen, drukt 'em hier in,
 * krijgt een per-(year, currency) overzicht terug — direct geschikt voor
 * jaarrapportage UI of NL Box-3 export-prep.
 */

import { computeCostBasis } from "./cost-basis";
import type { ParsedTransaction, TxType } from "./types";

export interface YearlyBucket {
  year: number;
  currency: string;
  realizedPnl: number;
  dividends: number;
  taxes: number;
  fees: number;
  interest: number;
  /** Inclusief BUY+SELL+DIVIDEND etc. — totaal aantal events. */
  events: number;
  trades: number;
}

export interface SummaryInput {
  /** Volledige transactielijst voor één portfolio. */
  transactions: Array<
    Pick<
      ParsedTransaction,
      | "type"
      | "quantity"
      | "price"
      | "fee"
      | "signedAmount"
      | "currency"
      | "executedAt"
      | "ticker"
      | "isin"
    > & { id: string }
  >;
}

export interface SummaryResult {
  /** Sleutel = `${year}|${currency}`. */
  byYearCurrency: Map<string, YearlyBucket>;
  /** Helemaal genest: alle yearly buckets als array, gesorteerd op (year desc, currency asc). */
  buckets: YearlyBucket[];
}

function bucketKey(year: number, currency: string): string {
  return `${year}|${currency}`;
}

function ensureBucket(
  map: Map<string, YearlyBucket>,
  year: number,
  currency: string,
): YearlyBucket {
  const key = bucketKey(year, currency);
  let b = map.get(key);
  if (!b) {
    b = {
      year,
      currency,
      realizedPnl: 0,
      dividends: 0,
      taxes: 0,
      fees: 0,
      interest: 0,
      events: 0,
      trades: 0,
    };
    map.set(key, b);
  }
  return b;
}

const TRADE_TYPES: TxType[] = ["BUY", "SELL"];

export function computeYearlySummary(input: SummaryInput): SummaryResult {
  const buckets = new Map<string, YearlyBucket>();

  // 1) Cash-only flows direct optellen per jaar/currency.
  for (const tx of input.transactions) {
    const year = tx.executedAt.getUTCFullYear();
    const ccy = (tx.currency || "EUR").toUpperCase();
    const b = ensureBucket(buckets, year, ccy);
    b.events += 1;
    if (TRADE_TYPES.includes(tx.type)) b.trades += 1;

    const sa = tx.signedAmount ?? 0;
    switch (tx.type) {
      case "DIVIDEND":
        b.dividends += sa;
        break;
      case "TAX":
        // Tax is doorgaans negatief (uitgaande), we tellen 'em als
        // positief absolut bedrag voor de UI: "totaal ingehouden".
        b.taxes += Math.abs(sa);
        break;
      case "FEE":
        b.fees += Math.abs(sa);
        break;
      case "INTEREST":
        b.interest += sa;
        break;
      // BUY/SELL: realized PnL bereken we via FIFO hieronder, niet hier.
      // CASH/FX/ADJUSTMENT: niet relevant voor jaaropgave-aggregaten.
    }
  }

  // 2) Realized PnL via FIFO per (ticker × currency), geboekt op het
  //    jaar van de SELL (consistent met NL fiscale praktijk: realisatie
  //    bij verkoop, niet bij aankoop).
  const tradeGroups = new Map<
    string,
    Array<typeof input.transactions[number]>
  >();
  for (const tx of input.transactions) {
    if (!TRADE_TYPES.includes(tx.type)) continue;
    if (!tx.ticker && !tx.isin) continue;
    const tickerKey = tx.ticker ?? `isin:${tx.isin}`;
    const ccy = (tx.currency || "EUR").toUpperCase();
    const k = `${tickerKey}|${ccy}`;
    const arr = tradeGroups.get(k) ?? [];
    arr.push(tx);
    tradeGroups.set(k, arr);
  }

  for (const [k, group] of tradeGroups) {
    const [tickerKey, ccy] = k.split("|") as [string, string];
    const cb = computeCostBasis({
      ticker: tickerKey,
      currency: ccy,
      transactions: group,
    });
    for (const trade of cb.realized) {
      const year = new Date(trade.closedAt).getUTCFullYear();
      const b = ensureBucket(buckets, year, ccy);
      b.realizedPnl += trade.realizedPnl;
    }
  }

  const sorted = Array.from(buckets.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return a.currency.localeCompare(b.currency);
  });

  return { byYearCurrency: buckets, buckets: sorted };
}
