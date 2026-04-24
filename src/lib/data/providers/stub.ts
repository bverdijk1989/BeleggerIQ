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
 * Deterministische stub-provider. Retourneert plausibele waarden op basis
 * van een simpele hash van de ticker zodat dev/test-runs reproducible zijn
 * zonder externe API's. Geen echte marktdata.
 */

function hashCode(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const DEFAULT_CURRENCY_FOR_SUFFIX: Record<string, Currency> = {
  ".AS": "EUR",
  ".PA": "EUR",
  ".DE": "EUR",
  ".L": "GBP",
  ".SW": "CHF",
  ".T": "JPY",
};

function inferCurrency(ticker: string): Currency {
  const upper = ticker.toUpperCase();
  for (const [suffix, currency] of Object.entries(DEFAULT_CURRENCY_FOR_SUFFIX)) {
    if (upper.endsWith(suffix)) return currency;
  }
  // USD default voor plain Amerikaanse tickers zoals MSFT, AAPL.
  if (/^[A-Z]{1,5}$/.test(upper)) return "USD";
  return "EUR";
}

// EUR als anker; overige koersen zijn deterministisch afgeleid.
const EUR_RATES: Record<Currency, number> = {
  EUR: 1,
  USD: 1.08,
  GBP: 0.86,
  CHF: 0.96,
  JPY: 162.5,
};

export class StubMarketDataProvider implements MarketDataProvider {
  readonly name = "stub";

  async getQuote(ticker: string): Promise<Quote | null> {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return null;

    const seed = hashCode(normalized);
    const base = 40 + (seed % 600);
    // Lichte dagvariatie: +/- 2%.
    const drift = Math.sin(seed * 0.01 + Date.now() / 86_400_000) * 0.02;
    const price = round(base * (1 + drift), 2);
    const changePct = round(drift, 4);
    const change = round(price * drift, 2);

    return {
      ticker: normalized,
      price,
      currency: inferCurrency(normalized),
      change,
      changePct,
      dayHigh: round(price * 1.01, 2),
      dayLow: round(price * 0.99, 2),
      volume: 1_000 + (seed % 10_000),
      asOf: new Date().toISOString(),
      source: this.name,
    };
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    const results = await Promise.all(tickers.map((t) => this.getQuote(t)));
    return results.filter((q): q is Quote => q !== null);
  }

  async getRate(from: Currency, to: Currency): Promise<FxRate | null> {
    if (from === to) {
      return { from, to, rate: 1, asOf: new Date().toISOString(), source: this.name };
    }
    const fromEur = EUR_RATES[from];
    const toEur = EUR_RATES[to];
    if (!fromEur || !toEur) return null;
    // rate = hoeveel `to` voor 1 `from`
    const rate = round(toEur / fromEur, 6);
    return {
      from,
      to,
      rate,
      asOf: new Date().toISOString(),
      source: this.name,
    };
  }

  async getFundamentals(ticker: string): Promise<FundamentalsSnapshot | null> {
    const normalized = ticker.trim().toUpperCase();
    if (!normalized) return null;
    const seed = hashCode(normalized);
    const currency = inferCurrency(normalized);

    return {
      ticker: normalized,
      asOf: new Date().toISOString(),
      currency,
      marketCap: 1_000_000_000 + (seed % 500_000_000_000),
      pe: round(10 + (seed % 2500) / 100, 2),
      pb: round(1 + (seed % 800) / 100, 2),
      evEbitda: round(8 + (seed % 2000) / 100, 2),
      dividendYield: round((seed % 500) / 10_000, 4),
      payoutRatio: round((seed % 700) / 1000, 4),
      roic: round(0.05 + (seed % 200) / 1000, 4),
      roe: round(0.07 + (seed % 300) / 1000, 4),
      grossMargin: round(0.25 + (seed % 400) / 1000, 4),
      operatingMargin: round(0.1 + (seed % 250) / 1000, 4),
      netMargin: round(0.05 + (seed % 200) / 1000, 4),
      debtToEquity: round((seed % 250) / 100, 2),
      revenueGrowth5y: round(((seed % 150) - 50) / 1000, 4),
      epsGrowth5y: round(((seed % 200) - 50) / 1000, 4),
      source: this.name,
    };
  }

  async getHistory(request: HistoryRequest): Promise<HistoricalPoint[]> {
    const normalized = request.ticker.trim().toUpperCase();
    if (!normalized) return [];
    const start = Date.parse(request.startDate);
    const end = Date.parse(request.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return [];
    }

    const interval = request.interval ?? "1d";
    const stepMs = intervalToMs(interval);
    const seed = hashCode(normalized);
    const base = 40 + (seed % 600);

    const points: HistoricalPoint[] = [];
    // Geometrisch random walk met lichte drift, deterministisch per ticker+datum.
    let price = base;
    const maxPoints = 2000;
    for (let t = start, i = 0; t <= end && i < maxPoints; t += stepMs, i++) {
      const noise = Math.sin((seed + i) * 0.37) * 0.015;
      price = Math.max(1, price * (1 + noise + 0.0002));
      const date = new Date(t).toISOString().slice(0, 10);
      points.push({
        date,
        open: round(price * 0.998, 2),
        high: round(price * 1.01, 2),
        low: round(price * 0.99, 2),
        close: round(price, 2),
        adjustedClose: round(price, 2),
        volume: 1_000 + ((seed + i) % 10_000),
      });
    }
    return points;
  }
}

function intervalToMs(interval: NonNullable<HistoryRequest["interval"]>): number {
  switch (interval) {
    case "1wk":
      return 7 * 24 * 60 * 60 * 1000;
    case "1mo":
      return 30 * 24 * 60 * 60 * 1000;
    case "1d":
    default:
      return 24 * 60 * 60 * 1000;
  }
}
