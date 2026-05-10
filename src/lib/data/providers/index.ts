import { log } from "@/lib/log";

import { AlphaVantageMarketDataProvider } from "./alpha-vantage";
import { FallbackProviderChain } from "./fallback-chain";
import { NoneMarketDataProvider } from "./none";
import { StubMarketDataProvider } from "./stub";
import type { MarketDataProvider } from "./types";
import { YahooMarketDataProvider } from "./yahoo";

/**
 * Resolver voor de actieve marktdata-provider. Kiest op basis van
 * `MARKET_DATA_PROVIDER` env var; default `stub`.
 *
 * Ondersteunde waarden:
 *  - `stub`            deterministische test-data (default)
 *  - `none`            geen live data; valt terug op Holding.currentPrice
 *  - `yahoo`           Yahoo Finance only
 *  - `alpha-vantage`   Alpha Vantage only (vereist ALPHA_VANTAGE_API_KEY)
 *  - `chain`/`fallback` Yahoo (primary) → Alpha Vantage (secondary).
 *                       M16-mitigatie tegen Yahoo-outages.
 */

let cachedProvider: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (cachedProvider) return cachedProvider;

  const name = (process.env.MARKET_DATA_PROVIDER ?? "stub").toLowerCase();
  switch (name) {
    case "none":
      cachedProvider = new NoneMarketDataProvider();
      return cachedProvider;
    case "yahoo":
      cachedProvider = new YahooMarketDataProvider();
      return cachedProvider;
    case "alpha":
    case "alphavantage":
    case "alpha-vantage":
      cachedProvider = new AlphaVantageMarketDataProvider();
      return cachedProvider;
    case "chain":
    case "fallback":
      // Yahoo primary; Alpha Vantage secondary. Bij Yahoo-circuit-open
      // of individuele null-response valt 'em automatisch over.
      cachedProvider = new FallbackProviderChain([
        new YahooMarketDataProvider(),
        new AlphaVantageMarketDataProvider(),
      ]);
      return cachedProvider;
    case "stub":
    default: {
      if (name !== "stub") {
        log.warn("market:provider", "onbekende provider, fallback op stub", {
          requested: name,
        });
      }
      cachedProvider = new StubMarketDataProvider();
      return cachedProvider;
    }
  }
}

/** Test-only: reset de gecachete provider zodat env-var-mutaties effect hebben. */
export function resetMarketDataProviderCache(): void {
  cachedProvider = null;
}

export type { MarketDataProvider } from "./types";
