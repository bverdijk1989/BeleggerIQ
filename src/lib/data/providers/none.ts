import type { Currency } from "@/types/common";
import type { FundamentalsSnapshot } from "@/types/factor";
import type {
  FxRate,
  HistoricalPoint,
  HistoryRequest,
  Quote,
} from "@/types/market";

import type { MarketDataProvider } from "./types";

/**
 * "None"-provider: retourneert geen live quotes, fundamentals of history.
 * Bedoeld voor productie-setups waar de waarheid in de geïmporteerde
 * portefeuille staat (bv. DEGIRO-export) — `Holding.currentPrice` blijft
 * dan leidend omdat de enrichment-laag bij een `null`-quote terugvalt op
 * de opgeslagen prijs.
 *
 * FX-rates worden wél hard-coded geleverd zodat USD/GBP/CHF/JPY-posities
 * niet 1:1 in base currency terechtkomen. Dit zijn benaderingen — voor
 * live koersen stap over op de Yahoo provider.
 */

const FX_TO_EUR: Record<Currency, number> = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17,
  CHF: 1.06,
  JPY: 0.0062,
};

function rate(from: Currency, to: Currency): number {
  // Cross-rates via EUR. EUR→X = 1/X_to_EUR.
  const fromEur = FX_TO_EUR[from];
  const toEur = FX_TO_EUR[to];
  if (!Number.isFinite(fromEur) || !Number.isFinite(toEur) || toEur === 0) {
    return 1;
  }
  return fromEur / toEur;
}

export class NoneMarketDataProvider implements MarketDataProvider {
  readonly name = "none";

  async getQuote(_ticker: string): Promise<Quote | null> {
    return null;
  }

  async getQuotes(_tickers: string[]): Promise<Quote[]> {
    return [];
  }

  async getRate(from: Currency, to: Currency): Promise<FxRate | null> {
    if (from === to) {
      return {
        from,
        to,
        rate: 1,
        asOf: new Date().toISOString(),
        source: "none:identity",
      };
    }
    return {
      from,
      to,
      rate: rate(from, to),
      asOf: new Date().toISOString(),
      source: "none:hardcoded",
    };
  }

  async getFundamentals(_ticker: string): Promise<FundamentalsSnapshot | null> {
    return null;
  }

  async getHistory(_request: HistoryRequest): Promise<HistoricalPoint[]> {
    return [];
  }
}
