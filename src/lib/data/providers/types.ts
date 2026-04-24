import type { Currency } from "@/types/common";
import type { FundamentalsSnapshot } from "@/types/factor";
import type {
  FxRate,
  HistoricalPoint,
  HistoryRequest,
  Quote,
} from "@/types/market";

/**
 * Provider-contracten. Elke bron (Yahoo, Alpha Vantage, IEX, stub)
 * implementeert deze interface zodat services los van de provider
 * kunnen werken.
 */

export interface QuoteProvider {
  getQuote(ticker: string): Promise<Quote | null>;
  getQuotes(tickers: string[]): Promise<Quote[]>;
}

export interface FxProvider {
  getRate(from: Currency, to: Currency): Promise<FxRate | null>;
}

export interface FundamentalsProvider {
  getFundamentals(ticker: string): Promise<FundamentalsSnapshot | null>;
}

export interface HistoryProvider {
  getHistory(request: HistoryRequest): Promise<HistoricalPoint[]>;
}

export interface MarketDataProvider
  extends QuoteProvider,
    FxProvider,
    FundamentalsProvider,
    HistoryProvider {
  readonly name: string;
}
