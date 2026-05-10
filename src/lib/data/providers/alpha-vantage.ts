import { log } from "@/lib/log";
import type { Currency } from "@/types/common";
import type { FundamentalsSnapshot } from "@/types/factor";
import type {
  FxRate,
  HistoricalPoint,
  HistoryRequest,
  Quote,
} from "@/types/market";

import {
  CircuitBreakerOpenError,
  fetchWithResilience,
  withCircuitBreaker,
} from "../resilience";

import type { MarketDataProvider } from "./types";

/**
 * Alpha Vantage adapter — secondary data-provider voor M16.
 *
 * Doel: redundancy voor Yahoo. Wanneer Yahoo een outage heeft of zijn
 * unofficial schema breekt (gebeurde in deze codebase al een keer met
 * v2→v3), schakelt de fallback-chain naar Alpha Vantage zodat de app
 * niet blind wordt.
 *
 * **Activatie**: `ALPHA_VANTAGE_API_KEY` env-var setten. Geen key →
 * adapter retourneert overal `null`/lege array (graceful no-op),
 * fallback-chain probeert dan stub of zit zonder data.
 *
 * **Free tier limits** (Alpha Vantage premium-free): 25 requests/day,
 * 5 requests/minute. Voor productie-gebruik raadt Alpha Vantage een
 * paid plan aan; deze adapter is bewust laag-volume bedoeld
 * (fallback-only, niet primary).
 *
 * Implementatie-keuzes:
 *  - **Circuit-breaker** per (ticker-of-bulk-call) — zelfde patroon als
 *    Yahoo, isoleert Alpha-Vantage-flake van app-uptime.
 *  - **Geen native SDK** — eenvoudige HTTPS-fetch met `fetchWithResilience`
 *    voor timeout + retry. Dit voorkomt een npm-dep waar we niet alle
 *    code over kennen.
 *  - **Minimal schema-coupling**: we mappen alleen velden die we ook
 *    écht gebruiken. Alpha Vantage levert veel meer velden, maar elke
 *    extra coupling is een toekomstige migration als hun API wijzigt.
 *
 * **Niet geïmplementeerd in deze MVP**:
 *  - `getFundamentals` — Alpha Vantage's `OVERVIEW` endpoint heeft
 *    company-data; toevoegen wanneer we dit nodig hebben (niet in
 *    fallback-pad voor risk/regime).
 *  - Caching boven de provider — bestaande `marketDataCache` wrapt
 *    al de get-calls op service-laag.
 */

const ALPHA_BREAKER = {
  name: "alpha-vantage",
  failureThreshold: 5,
  cooldownMs: 60_000, // langer dan Yahoo (lager rate-limit)
} as const;

const BASE_URL = "https://www.alphavantage.co/query";

interface AlphaQuoteResponse {
  "Global Quote"?: {
    "01. symbol"?: string;
    "05. price"?: string;
    "06. volume"?: string;
    "07. latest trading day"?: string;
    "09. change"?: string;
    "10. change percent"?: string;
  };
  Note?: string; // rate-limit boodschap
  Information?: string; // rate-limit boodschap (premium)
  "Error Message"?: string;
}

interface AlphaFxResponse {
  "Realtime Currency Exchange Rate"?: {
    "1. From_Currency Code"?: string;
    "3. To_Currency Code"?: string;
    "5. Exchange Rate"?: string;
    "6. Last Refreshed"?: string;
  };
  Note?: string;
  Information?: string;
  "Error Message"?: string;
}

interface AlphaDailyResponse {
  "Time Series (Daily)"?: Record<
    string,
    {
      "1. open"?: string;
      "2. high"?: string;
      "3. low"?: string;
      "4. close"?: string;
      "5. volume"?: string;
    }
  >;
  Note?: string;
  Information?: string;
  "Error Message"?: string;
}

function isCircuitOpen(error: unknown): boolean {
  return error instanceof CircuitBreakerOpenError;
}

function parseFiniteFloat(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Detecteert Alpha Vantage's rate-limit/error-payload. Hun API geeft
 * altijd HTTP 200 — ook bij rate-limit. We moeten naar de body kijken.
 */
function detectAlphaError(payload: {
  Note?: string;
  Information?: string;
  "Error Message"?: string;
}): string | null {
  if (payload["Error Message"]) return payload["Error Message"];
  if (payload.Note) return payload.Note;
  if (payload.Information) return payload.Information;
  return null;
}

export class AlphaVantageMarketDataProvider implements MarketDataProvider {
  readonly name = "alpha-vantage";

  private readonly apiKey: string | null;

  constructor(apiKey: string | null = process.env.ALPHA_VANTAGE_API_KEY ?? null) {
    this.apiKey = apiKey && apiKey.trim().length > 0 ? apiKey : null;
    if (!this.apiKey) {
      log.warn(
        "alpha-vantage",
        "ALPHA_VANTAGE_API_KEY ontbreekt — adapter draait in no-op modus",
      );
    }
  }

  private buildUrl(params: Record<string, string>): string {
    const search = new URLSearchParams({
      ...params,
      apikey: this.apiKey ?? "demo",
    });
    return `${BASE_URL}?${search.toString()}`;
  }

  async getQuote(ticker: string): Promise<Quote | null> {
    if (!this.apiKey) return null;
    try {
      const payload = await withCircuitBreaker(
        () => this.fetchJson<AlphaQuoteResponse>({
          function: "GLOBAL_QUOTE",
          symbol: ticker,
        }),
        ALPHA_BREAKER,
      );
      const err = detectAlphaError(payload);
      if (err) {
        log.warn("alpha-vantage:quote", "api_error", { ticker, error: err });
        return null;
      }
      const raw = payload["Global Quote"];
      if (!raw) return null;
      const price = parseFiniteFloat(raw["05. price"]);
      if (price === undefined) return null;
      const change = parseFiniteFloat(raw["09. change"]);
      const changePctStr = raw["10. change percent"];
      const changePct =
        changePctStr && changePctStr.endsWith("%")
          ? parseFiniteFloat(changePctStr.slice(0, -1))
          : undefined;
      return {
        ticker: (raw["01. symbol"] ?? ticker).toUpperCase(),
        price,
        currency: "USD" as Currency, // Alpha Vantage returnt geen currency op GLOBAL_QUOTE
        change,
        changePct: typeof changePct === "number" ? changePct / 100 : undefined,
        volume: parseFiniteFloat(raw["06. volume"]),
        asOf: raw["07. latest trading day"]
          ? new Date(raw["07. latest trading day"]).toISOString()
          : new Date().toISOString(),
        source: "alpha-vantage",
      };
    } catch (error) {
      if (isCircuitOpen(error)) return null;
      log.warn("alpha-vantage:quote", "fetch failed", { ticker, error });
      return null;
    }
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    if (!this.apiKey || tickers.length === 0) return [];
    // Alpha Vantage heeft geen bulk-quote endpoint op de free tier.
    // We resolven sequentieel — caller moet zich bewust zijn van de
    // 5/min rate-limit. Voor fallback-pad is dit acceptabel; de service-
    // laag cached.
    const out: Quote[] = [];
    for (const ticker of tickers) {
      const q = await this.getQuote(ticker);
      if (q) out.push(q);
    }
    return out;
  }

  async getRate(from: Currency, to: Currency): Promise<FxRate | null> {
    if (!this.apiKey) return null;
    if (from === to) {
      return {
        from,
        to,
        rate: 1,
        asOf: new Date().toISOString(),
        source: "alpha-vantage",
      };
    }
    try {
      const payload = await withCircuitBreaker(
        () => this.fetchJson<AlphaFxResponse>({
          function: "CURRENCY_EXCHANGE_RATE",
          from_currency: from,
          to_currency: to,
        }),
        ALPHA_BREAKER,
      );
      const err = detectAlphaError(payload);
      if (err) {
        log.warn("alpha-vantage:fx", "api_error", { from, to, error: err });
        return null;
      }
      const raw = payload["Realtime Currency Exchange Rate"];
      if (!raw) return null;
      const rate = parseFiniteFloat(raw["5. Exchange Rate"]);
      if (rate === undefined) return null;
      return {
        from,
        to,
        rate,
        asOf: raw["6. Last Refreshed"]
          ? new Date(raw["6. Last Refreshed"]).toISOString()
          : new Date().toISOString(),
        source: "alpha-vantage",
      };
    } catch (error) {
      if (isCircuitOpen(error)) return null;
      log.warn("alpha-vantage:fx", "fetch failed", { from, to, error });
      return null;
    }
  }

  async getFundamentals(_ticker: string): Promise<FundamentalsSnapshot | null> {
    // Bewust niet geïmplementeerd in deze MVP. Yahoo's `quoteSummary`
    // levert dit beter; Alpha Vantage's OVERVIEW endpoint kan in een
    // volgende sprint worden toegevoegd indien nodig.
    return null;
  }

  async getHistory(request: HistoryRequest): Promise<HistoricalPoint[]> {
    if (!this.apiKey) return [];
    try {
      const startTs = new Date(request.startDate).getTime();
      const endTs = new Date(request.endDate).getTime();
      const days = (endTs - startTs) / (1000 * 60 * 60 * 24);

      const payload = await withCircuitBreaker(
        () => this.fetchJson<AlphaDailyResponse>({
          function: "TIME_SERIES_DAILY",
          symbol: request.ticker,
          outputsize: days > 100 ? "full" : "compact",
        }),
        ALPHA_BREAKER,
      );
      const err = detectAlphaError(payload);
      if (err) {
        log.warn("alpha-vantage:history", "api_error", {
          ticker: request.ticker,
          error: err,
        });
        return [];
      }
      const series = payload["Time Series (Daily)"];
      if (!series) return [];

      const points: HistoricalPoint[] = [];
      for (const [dateStr, ohlc] of Object.entries(series)) {
        const ts = new Date(dateStr).getTime();
        if (!Number.isFinite(ts) || ts < startTs || ts > endTs) continue;
        const close = parseFiniteFloat(ohlc["4. close"]);
        if (close === undefined) continue;
        points.push({
          date: new Date(ts).toISOString(),
          open: parseFiniteFloat(ohlc["1. open"]),
          high: parseFiniteFloat(ohlc["2. high"]),
          low: parseFiniteFloat(ohlc["3. low"]),
          close,
          volume: parseFiniteFloat(ohlc["5. volume"]),
        });
      }
      points.sort((a, b) => (a.date < b.date ? -1 : 1));
      return points;
    } catch (error) {
      if (isCircuitOpen(error)) return [];
      log.warn("alpha-vantage:history", "fetch failed", {
        ticker: request.ticker,
        error,
      });
      return [];
    }
  }

  /** Gedeelde fetch — single point voor alle endpoints zodat retries +
   *  timeout consistent zijn. Returns altijd JSON. */
  private async fetchJson<T>(params: Record<string, string>): Promise<T> {
    const url = this.buildUrl(params);
    const res = await fetchWithResilience(url, {
      timeoutMs: 6_000,
      retry: { retries: 1, scope: "alpha-vantage:fetch" },
      scope: "alpha-vantage",
    });
    if (!res.ok) {
      throw new Error(`Alpha Vantage HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  }
}
