import { log } from "@/lib/log";

import { StubMarketDataProvider } from "./stub";
import type { MarketDataProvider } from "./types";

/**
 * Resolver voor de actieve marktdata-provider. Kiest op basis van
 * `MARKET_DATA_PROVIDER` env var; default `stub`. Additional adapters
 * (yahoo, alphavantage, iex, ...) kunnen hier geregistreerd worden.
 *
 * NB: provider-API keys leven uitsluitend server-side via process.env en
 * komen nooit in de client bundle — services die deze factory gebruiken
 * zijn zelf ook server-only.
 */

let cachedProvider: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (cachedProvider) return cachedProvider;

  const name = (process.env.MARKET_DATA_PROVIDER ?? "stub").toLowerCase();
  switch (name) {
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

export type { MarketDataProvider } from "./types";
