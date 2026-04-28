/**
 * Domain-types voor transaction-import. Los gehouden van Prisma-types
 * zodat de parser/engine niet gekoppeld is aan ORM-runtime — handig voor
 * zowel server-side import als toekomstige client-side preview.
 */

export type TxType =
  | "BUY"
  | "SELL"
  | "DIVIDEND"
  | "INTEREST"
  | "FEE"
  | "TAX"
  | "CASH"
  | "FX"
  | "ADJUSTMENT";

/** Pure tx-shape. Bedragen genormaliseerd: signedAmount = cash-effect in `currency`. */
export interface ParsedTransaction {
  externalId: string;
  source: string;
  type: TxType;
  ticker: string | null;
  isin: string | null;
  name: string | null;
  quantity: number | null;
  price: number | null;
  fee: number | null;
  signedAmount: number | null;
  currency: string;
  executedAt: Date;
  metadata: Record<string, unknown>;
}

export interface ParseRowError {
  rowIndex: number;
  rawRow: Record<string, string>;
  reason: string;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  errors: ParseRowError[];
  /** Totaal aantal data-rijen gezien in de CSV (excl. header). */
  rowsSeen: number;
}
