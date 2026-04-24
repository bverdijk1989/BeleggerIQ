import yahooFinance from "yahoo-finance2";

import { log } from "@/lib/log";
import type { Currency } from "@/types/common";
import type { FundamentalsSnapshot } from "@/types/factor";
import type {
  FxRate,
  HistoricalPoint,
  HistoryInterval,
  HistoryRequest,
  Quote,
} from "@/types/market";

import type { MarketDataProvider } from "./types";

/**
 * Yahoo Finance adapter via de `yahoo-finance2` package.
 *
 * Voordelen: geen API-key nodig, dekt quotes/FX/fundamentals/history onder één
 * interface. Nadelen: unofficial API (rate-limits, occasional schema shifts,
 * geen SLA). Voor productie met veel traffic: verplaats naar een betaalde
 * provider (Alpha Vantage, Finnhub, IEX Cloud) door dezelfde interface te
 * implementeren.
 *
 * Design notes:
 *  - yahoo-finance2 heeft strikte TS overloads die zonder `fields` opties
 *    naar `never` narrowen. We typen de responses dus via een lichte
 *    `YahooQuoteShape` en casten binnen de adapter — buiten dit bestand
 *    blijft alles strict-typed.
 *  - Alle methodes zijn defensief: Yahoo levert vaak undefined-velden
 *    voor niet-US-tickers. Wij retourneren `undefined` i.p.v. NaN.
 *  - Ticker-suffixen (.AS, .L, .DE, ...) werken ongewijzigd.
 *  - FX-pairs worden gebouwd als `${from}${to}=X` (Yahoo-conventie).
 */

// Survey-notice van yahoo-finance2 onderdrukken — verschijnt anders elke
// process-lifetime in de logs. De API is runtime-aanwezig maar TS-types
// dekken 'm niet; cast om strict-mode tevreden te houden.
const suppress = (yahooFinance as unknown as {
  suppressNotices?: (keys: string[]) => void;
}).suppressNotices;
if (typeof suppress === "function") {
  suppress(["ripHistorical", "yahooSurvey"]);
}

interface YahooQuoteShape {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketTime?: Date | number;
  currency?: string;
}

interface YahooSummaryShape {
  price?: { currency?: string; marketCap?: number };
  summaryDetail?: {
    currency?: string;
    trailingPE?: number;
    forwardPE?: number;
    priceToSalesTrailing12Months?: number;
    dividendYield?: number;
    payoutRatio?: number;
  };
  defaultKeyStatistics?: {
    enterpriseValue?: number;
    priceToBook?: number;
    enterpriseToEbitda?: number;
    enterpriseToRevenue?: number;
  };
  financialData?: {
    returnOnEquity?: number;
    returnOnAssets?: number;
    grossMargins?: number;
    operatingMargins?: number;
    profitMargins?: number;
    debtToEquity?: number;
    revenueGrowth?: number;
    earningsGrowth?: number;
  };
}

interface YahooChartPoint {
  date?: Date | string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  adjclose?: number;
  volume?: number;
}

interface YahooChartShape {
  quotes?: YahooChartPoint[];
}

function toCurrency(value: string | undefined | null): Currency {
  const upper = (value ?? "EUR").toUpperCase();
  if (
    upper === "EUR" ||
    upper === "USD" ||
    upper === "GBP" ||
    upper === "CHF" ||
    upper === "JPY"
  ) {
    return upper;
  }
  return "EUR";
}

function finiteOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toIsoDate(d: Date | number | undefined): string {
  if (d === undefined) return new Date().toISOString();
  const date = typeof d === "number" ? new Date(d * 1000) : d;
  return date.toISOString();
}

function mapQuote(ticker: string, raw: YahooQuoteShape): Quote | null {
  if (typeof raw.regularMarketPrice !== "number") return null;
  // LSE-tickers noteren in pence (GBp). Normaliseer naar GBP.
  let price = raw.regularMarketPrice;
  let currency = toCurrency(raw.currency);
  if (raw.currency === "GBp") {
    price = price / 100;
    currency = "GBP";
  }
  return {
    ticker: ticker.toUpperCase(),
    price,
    currency,
    change: finiteOrUndefined(raw.regularMarketChange),
    changePct:
      typeof raw.regularMarketChangePercent === "number"
        ? raw.regularMarketChangePercent / 100
        : undefined,
    dayHigh: finiteOrUndefined(raw.regularMarketDayHigh),
    dayLow: finiteOrUndefined(raw.regularMarketDayLow),
    volume: finiteOrUndefined(raw.regularMarketVolume),
    asOf: toIsoDate(raw.regularMarketTime),
    source: "yahoo",
  };
}

const HISTORY_INTERVAL_MAP: Record<HistoryInterval, "1d" | "1wk" | "1mo"> = {
  "1d": "1d",
  "1wk": "1wk",
  "1mo": "1mo",
};

export class YahooMarketDataProvider implements MarketDataProvider {
  readonly name = "yahoo";

  async getQuote(ticker: string): Promise<Quote | null> {
    try {
      const raw = (await yahooFinance.quote(ticker)) as unknown as
        | YahooQuoteShape
        | undefined;
      if (!raw) return null;
      return mapQuote(ticker, raw);
    } catch (error) {
      log.warn("yahoo:quote", "fetch failed", { ticker, error });
      return null;
    }
  }

  async getQuotes(tickers: string[]): Promise<Quote[]> {
    if (tickers.length === 0) return [];
    try {
      const raw = (await yahooFinance.quote(tickers)) as unknown as
        | YahooQuoteShape
        | YahooQuoteShape[]
        | undefined;
      if (!raw) return [];
      const list = Array.isArray(raw) ? raw : [raw];
      const mapped: Quote[] = [];
      for (const q of list) {
        const converted = mapQuote(q.symbol ?? "", q);
        if (converted) mapped.push(converted);
      }
      return mapped;
    } catch (error) {
      log.warn("yahoo:quotes", "batch fetch failed", {
        count: tickers.length,
        error,
      });
      return [];
    }
  }

  async getRate(from: Currency, to: Currency): Promise<FxRate | null> {
    if (from === to) {
      return {
        from,
        to,
        rate: 1,
        asOf: new Date().toISOString(),
        source: "yahoo:identity",
      };
    }
    const symbol = `${from}${to}=X`;
    try {
      const raw = (await yahooFinance.quote(symbol)) as unknown as
        | YahooQuoteShape
        | undefined;
      if (!raw || typeof raw.regularMarketPrice !== "number") return null;
      return {
        from,
        to,
        rate: raw.regularMarketPrice,
        asOf: toIsoDate(raw.regularMarketTime),
        source: "yahoo",
      };
    } catch (error) {
      log.warn("yahoo:fx", "fetch failed", { from, to, error });
      return null;
    }
  }

  async getFundamentals(ticker: string): Promise<FundamentalsSnapshot | null> {
    try {
      const raw = (await yahooFinance.quoteSummary(ticker, {
        modules: [
          "summaryDetail",
          "defaultKeyStatistics",
          "financialData",
          "price",
        ],
      })) as unknown as YahooSummaryShape | undefined;
      if (!raw) return null;

      const summary = raw.summaryDetail ?? {};
      const stats = raw.defaultKeyStatistics ?? {};
      const financial = raw.financialData ?? {};
      const price = raw.price ?? {};

      const currency = toCurrency(price.currency ?? summary.currency);

      return {
        ticker: ticker.toUpperCase(),
        asOf: new Date().toISOString(),
        currency,

        marketCap: finiteOrUndefined(price.marketCap),
        enterpriseValue: finiteOrUndefined(stats.enterpriseValue),

        pe: finiteOrUndefined(summary.trailingPE),
        forwardPe: finiteOrUndefined(summary.forwardPE),
        pb: finiteOrUndefined(stats.priceToBook),
        ps: finiteOrUndefined(summary.priceToSalesTrailing12Months),
        evEbitda: finiteOrUndefined(stats.enterpriseToEbitda),
        evSales: finiteOrUndefined(stats.enterpriseToRevenue),

        // Yahoo levert geen expliciete ROIC; laten we bewust ongezet i.p.v.
        // een zwakke proxy (zoals ROE) te presenteren.
        roic: undefined,
        roe: finiteOrUndefined(financial.returnOnEquity),
        roa: finiteOrUndefined(financial.returnOnAssets),
        grossMargin: finiteOrUndefined(financial.grossMargins),
        operatingMargin: finiteOrUndefined(financial.operatingMargins),
        netMargin: finiteOrUndefined(financial.profitMargins),
        debtToEquity:
          typeof financial.debtToEquity === "number"
            ? financial.debtToEquity / 100 // Yahoo levert als percentage
            : undefined,

        dividendYield: finiteOrUndefined(summary.dividendYield),
        payoutRatio: finiteOrUndefined(summary.payoutRatio),

        revenueGrowthTtm: finiteOrUndefined(financial.revenueGrowth),
        epsGrowthTtm: finiteOrUndefined(financial.earningsGrowth),

        source: "yahoo",
      };
    } catch (error) {
      log.warn("yahoo:fundamentals", "fetch failed", { ticker, error });
      return null;
    }
  }

  async getHistory(request: HistoryRequest): Promise<HistoricalPoint[]> {
    const interval = HISTORY_INTERVAL_MAP[request.interval ?? "1d"];
    try {
      const raw = (await yahooFinance.chart(request.ticker, {
        period1: new Date(request.startDate),
        period2: new Date(request.endDate),
        interval,
      })) as unknown as YahooChartShape | undefined;
      const quotes = raw?.quotes ?? [];
      const points: HistoricalPoint[] = [];
      for (const q of quotes) {
        if (typeof q.close !== "number" || !Number.isFinite(q.close)) continue;
        const dateStr =
          q.date instanceof Date
            ? q.date.toISOString().slice(0, 10)
            : String(q.date ?? "").slice(0, 10);
        if (!dateStr) continue;
        points.push({
          date: dateStr,
          open: finiteOrUndefined(q.open),
          high: finiteOrUndefined(q.high),
          low: finiteOrUndefined(q.low),
          close: q.close,
          adjustedClose: finiteOrUndefined(q.adjclose),
          volume: finiteOrUndefined(q.volume),
        });
      }
      return points;
    } catch (error) {
      log.warn("yahoo:history", "fetch failed", {
        ticker: request.ticker,
        error,
      });
      return [];
    }
  }
}
