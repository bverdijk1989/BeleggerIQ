import { getFxRate } from "@/lib/data/fx";
import { getFundamentals } from "@/lib/data/fundamentals";
import { getHistory } from "@/lib/data/history";
import { getQuotes } from "@/lib/data/quotes";
import { log } from "@/lib/log";
import type { Currency, ISODateString } from "@/types/common";
import type {
  FactorScore,
  FactorWeights,
  FundamentalsSnapshot,
} from "@/types/factor";
import type { HistoricalPoint, Quote } from "@/types/market";
import type { Holding } from "@/types/portfolio";

import { scoreFactors } from "./factors/composite";
import { valueHolding, type HoldingValuation, type PriceSource } from "./valuation";

/**
 * Enrichment service.
 *
 * Haalt parallel quotes, FX-rates en (optioneel) fundamentals op en
 * bouwt `HoldingValuation[]` in de gekozen base currency. Defensief:
 *  - Ontbrekende quote → valt terug op `Holding.currentPrice` of `avgCostPrice`.
 *  - Ontbrekende FX → fxRate 1 (met warning log), zodat totalen niet crashen.
 *  - Lege holdings-input → lege output met correcte lege maps.
 */

export interface EnrichmentOptions {
  baseCurrency: Currency;
  /** Fetched naast quotes/FX. Niet standaard omdat dit extra provider-calls kost. */
  includeFundamentals?: boolean;
  /** Bereken composite factor scores per holding. Vereist fundamentals om
   * iets anders dan neutraal te produceren; schakel samen met
   * `includeFundamentals` in voor bruikbare scores. */
  includeFactorScores?: boolean;
  /** Gewichten voor de factor scores. Default: `DEFAULT_FACTOR_WEIGHTS`. */
  factorWeights?: FactorWeights;
}

export interface EnrichmentResult {
  valuations: HoldingValuation[];
  quotes: Map<string, Quote>;
  fundamentals: Map<string, FundamentalsSnapshot>;
  fxRates: Map<Currency, number>;
  /** Price history per ticker, alleen gevuld als `includeFactorScores`. */
  priceHistories: Map<string, HistoricalPoint[]>;
  factorScores: Map<string, FactorScore>;
  asOf: ISODateString;
}

export async function enrichHoldings(
  holdings: Holding[],
  options: EnrichmentOptions,
): Promise<EnrichmentResult> {
  const asOf = new Date().toISOString();
  if (holdings.length === 0) {
    return {
      valuations: [],
      quotes: new Map(),
      fundamentals: new Map(),
      fxRates: new Map<Currency, number>([[options.baseCurrency, 1]]),
      priceHistories: new Map(),
      factorScores: new Map(),
      asOf,
    };
  }

  const tickers = Array.from(new Set(holdings.map((h) => h.ticker)));
  const currencies = Array.from(
    new Set(holdings.map((h) => h.currency)),
  ) as Currency[];

  // Factor scoring heeft fundamentals nodig; schakel ze automatisch in.
  const wantFundamentals =
    options.includeFundamentals === true || options.includeFactorScores === true;

  // Fetch alles parallel; elk deel heeft zijn eigen try/catch zodat één
  // falende bron de rest niet meetrekt.
  const [quoteList, fxEntries, fundamentalsEntries, historyEntries] =
    await Promise.all([
      safeQuotes(tickers),
      Promise.all(
        currencies.map(async (currency): Promise<[Currency, number]> => {
          if (currency === options.baseCurrency) return [currency, 1];
          const rate = await getFxRate(currency, options.baseCurrency);
          if (rate) return [currency, rate.rate];
          log.warn("enrich", "FX rate unavailable; using fallback 1", {
            from: currency,
            to: options.baseCurrency,
          });
          return [currency, 1];
        }),
      ),
      wantFundamentals
        ? Promise.all(
            tickers.map(
              async (
                ticker,
              ): Promise<[string, FundamentalsSnapshot | null]> => [
                ticker,
                await safeFundamentals(ticker),
              ],
            ),
          )
        : Promise.resolve(
            [] as Array<[string, FundamentalsSnapshot | null]>,
          ),
      options.includeFactorScores
        ? Promise.all(
            tickers.map(
              async (ticker): Promise<[string, HistoricalPoint[]]> => [
                ticker,
                await safeHistoryWindow(ticker),
              ],
            ),
          )
        : Promise.resolve([] as Array<[string, HistoricalPoint[]]>),
    ]);

  const quotes = new Map(quoteList.map((q) => [q.ticker, q]));
  const fxRates = new Map<Currency, number>(fxEntries);
  const fundamentals = new Map<string, FundamentalsSnapshot>(
    fundamentalsEntries
      .filter(
        (entry): entry is [string, FundamentalsSnapshot] => entry[1] !== null,
      ),
  );
  const priceHistories = new Map<string, HistoricalPoint[]>(historyEntries);

  const valuations = holdings.map((holding) => {
    const quote = quotes.get(holding.ticker);
    const fxRate = fxRates.get(holding.currency) ?? 1;
    const { unitPrice, priceSource } = pickPrice(holding, quote);
    return valueHolding(holding, {
      baseCurrency: options.baseCurrency,
      unitPrice,
      fxRate,
      priceSource,
      asOf: quote?.asOf ?? asOf,
    });
  });

  const factorScores = new Map<string, FactorScore>();
  if (options.includeFactorScores) {
    for (const holding of holdings) {
      const score = scoreFactors(
        {
          ticker: holding.ticker,
          asOf,
          fundamentals: fundamentals.get(holding.ticker) ?? null,
          priceHistory: priceHistories.get(holding.ticker) ?? null,
          volatility: holding.volatility ?? null,
          beta: holding.beta ?? null,
        },
        options.factorWeights,
      );
      factorScores.set(holding.ticker, score);
    }
  }

  return {
    valuations,
    quotes,
    fundamentals,
    fxRates,
    priceHistories,
    factorScores,
    asOf,
  };
}

function pickPrice(
  holding: Holding,
  quote: Quote | undefined,
): { unitPrice: number | undefined; priceSource: PriceSource } {
  if (quote && Number.isFinite(quote.price)) {
    return { unitPrice: quote.price, priceSource: "market" };
  }
  if (
    holding.currentPrice !== undefined &&
    holding.currentPrice !== null &&
    Number.isFinite(holding.currentPrice)
  ) {
    return { unitPrice: holding.currentPrice, priceSource: "lastKnown" };
  }
  return { unitPrice: undefined, priceSource: "costBasis" };
}

async function safeQuotes(tickers: string[]): Promise<Quote[]> {
  try {
    return await getQuotes(tickers);
  } catch (error) {
    log.warn("enrich", "quotes failed; using holding fallback", { error });
    return [];
  }
}

async function safeFundamentals(
  ticker: string,
): Promise<FundamentalsSnapshot | null> {
  try {
    return await getFundamentals(ticker);
  } catch (error) {
    log.warn("enrich", "fundamentals failed", { ticker, error });
    return null;
  }
}

/** ~13 maanden daily history, voldoende voor 6m/12m/12-1 momentum. */
async function safeHistoryWindow(ticker: string): Promise<HistoricalPoint[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 400);
  try {
    return await getHistory({
      ticker,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      interval: "1d",
    });
  } catch (error) {
    log.warn("enrich", "history failed", { ticker, error });
    return [];
  }
}
