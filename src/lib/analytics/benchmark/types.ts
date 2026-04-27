import type { ISODateString } from "@/types/common";

/**
 * Benchmark & Performance Attribution types.
 *
 * Doel: laat de gebruiker zien of zijn portefeuille beter of slechter
 * presteert dan de markt, én **waarom** (sector, factor, stock-alpha).
 *
 * Design-principes:
 *  - Deterministisch: identieke input → identieke output. Geen AI.
 *  - Defensief bij missende data: fallback-waarden (geen exceptions).
 *  - Transparant: elke attribution-bucket draagt zijn eigen weight,
 *    return en contributie zodat de UI niets hoeft te herberekenen.
 */

// ============================================================
//  Benchmark catalogus
// ============================================================

export type BenchmarkId = "MSCI_WORLD" | "SP500" | "ALL_WORLD";

export interface BenchmarkDefinition {
  id: BenchmarkId;
  /** Yahoo-ticker (primary) — gebruikt door de fetcher. */
  ticker: string;
  /** Fallback-tickers, bv. ETF-equivalenten. */
  fallbackTickers: string[];
  label: string;
  description: string;
}

export const BENCHMARK_CATALOG: Record<BenchmarkId, BenchmarkDefinition> = {
  MSCI_WORLD: {
    id: "MSCI_WORLD",
    ticker: "IWDA.AS",
    fallbackTickers: ["URTH", "SWDA.L", "EUNL.DE"],
    label: "MSCI World",
    description: "Wereldwijde large/mid-cap aandelen (developed markets).",
  },
  SP500: {
    id: "SP500",
    ticker: "^GSPC",
    fallbackTickers: ["SPY", "VOO", "CSPX.L"],
    label: "S&P 500",
    description: "500 grootste US large-caps.",
  },
  ALL_WORLD: {
    id: "ALL_WORLD",
    ticker: "VWCE.DE",
    fallbackTickers: ["VWRL.AS", "VT", "VWCE.AS"],
    label: "All World (VWCE)",
    description: "FTSE All-World — developed + emerging markets.",
  },
};

export const DEFAULT_BENCHMARK_ID: BenchmarkId = "MSCI_WORLD";

// ============================================================
//  Performance & tracking-error
// ============================================================

export interface BenchmarkSeriesPoint {
  date: ISODateString;
  /** Genormaliseerd naar de eerste waarde van het venster (= 100). */
  index: number;
}

export interface BenchmarkPerformance {
  benchmark: {
    id: BenchmarkId;
    label: string;
    ticker: string;
    /** True wanneer 'ie via fallback-ticker is opgehaald. */
    usedFallback: boolean;
  };
  /** ISO-periode van de meting. */
  periodStart: ISODateString;
  periodEnd: ISODateString;
  monthsObserved: number;

  /** Total return van de portefeuille over de periode (fractie). */
  portfolioReturn: number;
  /** Total return van de benchmark over dezelfde periode. */
  benchmarkReturn: number;
  /** outperformance = portfolioReturn − benchmarkReturn. */
  alpha: number;
  /** Annualized tracking error (st-dev van excess-returns × √12). */
  trackingError: number;
  /** Information ratio = (annualised alpha) / trackingError. */
  informationRatio: number | null;

  /** Genormaliseerde reeksen voor de UI (start = 100). */
  portfolioSeries: BenchmarkSeriesPoint[];
  benchmarkSeries: BenchmarkSeriesPoint[];

  /** Lijst van gemeten data-quality issues. Leeg = clean. */
  warnings: string[];
}

// ============================================================
//  Attribution
// ============================================================

/**
 * Eén bucket in de attribution-breakdown — een sector, factor of stock.
 *
 * Convenant:
 *   - `weight` = portefeuille-gewicht in deze bucket (fractie 0..1).
 *   - `bucketReturn` = total return van de bucket over de periode.
 *   - `benchmarkReturn` = total return van de benchmark in dezelfde
 *     bucket (of, bij stock-alpha, de benchmark als geheel).
 *   - `contribution` = `weight × (bucketReturn − benchmarkReturn)`
 *     → rechtstreeks optelbaar tot de totale alpha (binnen
 *     afrond-ruis).
 */
export interface AttributionBucket {
  key: string;
  label: string;
  weight: number;
  bucketReturn: number;
  benchmarkReturn: number;
  contribution: number;
  /** Aantal posities in deze bucket — UI helper. */
  positions: number;
}

export interface AttributionBreakdown {
  /** Per sector (of "Onbekend" wanneer holding geen sector heeft). */
  sectors: AttributionBucket[];
  /** Per factor: quality / value / momentum (low/high split). */
  factors: AttributionBucket[];
  /** Top-N single-stock alpha: bijdrage per individuele positie. */
  stocks: AttributionBucket[];
  /** Som van alle sector-contributies (sanity-check vs alpha). */
  totalSectorContribution: number;
  totalFactorContribution: number;
  totalStockContribution: number;
  /** Verschil met `alpha` — niet-toegewezen residual. */
  residualAlpha: number;
}

// ============================================================
//  Combined report
// ============================================================

export interface BenchmarkReport {
  generatedAt: ISODateString;
  performance: BenchmarkPerformance;
  attribution: AttributionBreakdown;
  /**
   * Plain-language verdict — 1 zin (NL). Geen AI, deterministisch
   * uit performance + attribution opgebouwd.
   */
  verdict: string;
}
