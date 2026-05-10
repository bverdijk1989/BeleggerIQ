import { log } from "@/lib/log";
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
 * Provider fallback-chain.
 *
 * Wraps een lijst providers achter dezelfde MarketDataProvider-interface.
 * Per call probeert 'em ze in volgorde — eerste die een non-null/
 * non-empty resultaat oplevert, wint. Errors van een individuele
 * provider triggeren de volgende.
 *
 * **Doel**: redundantie tegen "Yahoo gaat plat = blinde app". De
 * Yahoo-adapter heeft nu al een circuit-breaker; bij open-circuit
 * vallen we automatisch terug op de volgende provider.
 *
 * **Volgorde matters**: zet de meest betrouwbare als primary, en de
 * fallback als secondary. Default-aanbeveling:
 *   yahoo (primary, geen API-key, breed) → alpha-vantage (secondary,
 *   API-key vereist, lage volume).
 *
 * Pure compositie — geen state, geen breakers van zichzelf. De
 * onderliggende providers zorgen voor hun eigen resilience-laag.
 */
export class FallbackProviderChain implements MarketDataProvider {
  readonly name: string;
  readonly providers: readonly MarketDataProvider[];

  constructor(providers: MarketDataProvider[]) {
    if (providers.length === 0) {
      throw new Error("FallbackProviderChain requires at least one provider");
    }
    this.providers = providers;
    this.name = `chain(${providers.map((p) => p.name).join(",")})`;
  }

  async getQuote(ticker: string): Promise<Quote | null> {
    for (const provider of this.providers) {
      try {
        const result = await provider.getQuote(ticker);
        if (result) return result;
      } catch (error) {
        log.warn("provider:chain", "getQuote_fallback", {
          provider: provider.name,
          ticker,
          error,
        });
      }
    }
    return null;
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    if (tickers.length === 0) return [];
    for (const provider of this.providers) {
      try {
        const result = await provider.getQuotes(tickers);
        // Beschouw als succes wanneer 'em ten minste één quote levert.
        // Een lege array suggereert dat de provider geen data heeft;
        // dan proberen we de volgende.
        if (result.length > 0) return result;
      } catch (error) {
        log.warn("provider:chain", "getQuotes_fallback", {
          provider: provider.name,
          count: tickers.length,
          error,
        });
      }
    }
    return [];
  }

  async getRate(from: Currency, to: Currency): Promise<FxRate | null> {
    for (const provider of this.providers) {
      try {
        const result = await provider.getRate(from, to);
        if (result) return result;
      } catch (error) {
        log.warn("provider:chain", "getRate_fallback", {
          provider: provider.name,
          from,
          to,
          error,
        });
      }
    }
    return null;
  }

  async getFundamentals(ticker: string): Promise<FundamentalsSnapshot | null> {
    for (const provider of this.providers) {
      try {
        const result = await provider.getFundamentals(ticker);
        if (result) return result;
      } catch (error) {
        log.warn("provider:chain", "getFundamentals_fallback", {
          provider: provider.name,
          ticker,
          error,
        });
      }
    }
    return null;
  }

  async getHistory(request: HistoryRequest): Promise<HistoricalPoint[]> {
    for (const provider of this.providers) {
      try {
        const result = await provider.getHistory(request);
        if (result.length > 0) return result;
      } catch (error) {
        log.warn("provider:chain", "getHistory_fallback", {
          provider: provider.name,
          ticker: request.ticker,
          error,
        });
      }
    }
    return [];
  }
}
