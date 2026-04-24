export type Currency = "EUR" | "USD" | "GBP" | "CHF" | "JPY";

export type ISODateString = string;

export interface Money {
  amount: number;
  currency: Currency;
}

export type Nullable<T> = T | null;
