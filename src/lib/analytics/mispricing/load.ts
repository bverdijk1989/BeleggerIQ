import { runScreen, type ScreenerCandidate } from "@/lib/analytics/screener";
import { getHistory } from "@/lib/data/history";
import { getFundamentals } from "@/lib/data/fundamentals";
import type { HistoricalPoint } from "@/types/market";

import {
  scanMispricing,
  type MispricingScanInput,
  type PeerBasketEntry,
} from "./scanner";
import type { MispricingReport } from "./types";
import { median } from "./shared";

/**
 * Server-only data-loader voor de Mispricing Scanner.
 *
 * Pipeline:
 *   1. Draai de `runScreen`-pool (default 40) om een breed universum met
 *      factor-scores + fundamentals + price-history te hebben.
 *   2. Groepeer kandidaten op sector voor peer-baskets.
 *   3. Bouw `MispricingScanInput` per ticker met benchmark-P/E
 *      (sector-mediaan) en FCF-yield (sector-mediaan).
 *   4. Fetch 260d price-history per ticker als die nog niet in de
 *      screener-output zit.
 *   5. Roep `scanMispricing` aan.
 *
 * Geen database-writes. Pure I/O + transformatie.
 */

export interface LoadMispricingInput {
  /**
   * Cap op het aantal tickers dat de scanner beoordeelt. Default 40 —
   * dat is genoeg dekking zonder de quote/history-fetch uit de hand te
   * laten lopen.
   */
  universeLimit?: number;
  /** Scanner-config door-gepompt naar `scanMispricing`. */
  minScore?: number;
  maxCandidates?: number;
  signalTtlDays?: number;
}

export interface LoadMispricingResult {
  report: MispricingReport;
  diagnostics: {
    universeSize: number;
    sectorsRepresented: number;
    /** Tickers waarvoor history-fetch faalde (teller). */
    missingHistory: number;
    /** Tickers zonder fundamentals. */
    missingFundamentals: number;
  };
}

export async function loadMispricingReport(
  input: LoadMispricingInput = {},
): Promise<LoadMispricingResult> {
  const limit = input.universeLimit ?? 40;
  const screen = await runScreen({ filters: {}, limit }).catch(() => null);
  const candidates = screen?.candidates ?? [];

  if (candidates.length === 0) {
    return {
      report: scanMispricing({
        universe: [],
        config: {
          minScore: input.minScore,
          maxCandidates: input.maxCandidates,
          signalTtlDays: input.signalTtlDays,
        },
      }),
      diagnostics: {
        universeSize: 0,
        sectorsRepresented: 0,
        missingHistory: 0,
        missingFundamentals: 0,
      },
    };
  }

  // Parallel-fetch histories voor alle kandidaten.
  const historyEntries = await Promise.all(
    candidates.map(async (c) => {
      const history = await fetchHistory(c.ticker).catch(
        () => [] as HistoricalPoint[],
      );
      return [c.ticker, history] as const;
    }),
  );
  const historyMap = new Map(historyEntries);

  // Sector-groepering voor peer-baskets.
  const bySector = new Map<string, ScreenerCandidate[]>();
  for (const c of candidates) {
    const existing = bySector.get(c.sector);
    if (existing) existing.push(c);
    else bySector.set(c.sector, [c]);
  }

  // Sector-mediaan benchmarks (P/E + FCF yield).
  const sectorBenchmarks = new Map<
    string,
    { medianPE: number | null; medianFcf: number | null }
  >();
  for (const [sector, list] of bySector) {
    const pes = list
      .map((c) => c.fundamentals?.pe ?? null)
      .filter(
        (v): v is number => v !== null && Number.isFinite(v) && v > 0,
      );
    const fcfs = list
      .map((c) => c.fundamentals?.fcfYield ?? null)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    sectorBenchmarks.set(sector, {
      medianPE: pes.length >= 3 ? median(pes) : null,
      medianFcf: fcfs.length >= 3 ? median(fcfs) : null,
    });
  }

  let missingHistory = 0;
  let missingFundamentals = 0;

  const universe: MispricingScanInput[] = candidates.map((c) => {
    const priceHistory = historyMap.get(c.ticker) ?? [];
    if (priceHistory.length < 200) missingHistory++;
    if (!c.fundamentals) missingFundamentals++;

    const sectorList = bySector.get(c.sector) ?? [];
    const peers: PeerBasketEntry[] = sectorList
      .filter((p) => p.ticker !== c.ticker)
      .map((p) => ({
        ticker: p.ticker,
        priceHistory: historyMap.get(p.ticker) ?? [],
      }))
      .filter((p) => p.priceHistory.length >= 200);

    const benchmarks = sectorBenchmarks.get(c.sector) ?? {
      medianPE: null,
      medianFcf: null,
    };

    return {
      ticker: c.ticker,
      name: c.name,
      priceHistory,
      fundamentals: c.fundamentals,
      factorScore: c.factorScore,
      benchmarkPE: benchmarks.medianPE,
      benchmarkFcfYield: benchmarks.medianFcf,
      historicalMedianPE: null, // 5-year hist-mediaan niet beschikbaar zonder historische snapshots
      peers,
      fundamentalsStable: deriveFundamentalsStable(c.fundamentals),
      priorFactorScore: null,
      sentimentScore: null,
    };
  });

  const report = scanMispricing({
    universe,
    config: {
      minScore: input.minScore,
      maxCandidates: input.maxCandidates,
      signalTtlDays: input.signalTtlDays,
    },
  });

  return {
    report,
    diagnostics: {
      universeSize: candidates.length,
      sectorsRepresented: bySector.size,
      missingHistory,
      missingFundamentals,
    },
  };
}

// ============================================================
//  Helpers
// ============================================================

async function fetchHistory(ticker: string): Promise<HistoricalPoint[]> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 400);
  return getHistory({
    ticker,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    interval: "1d",
  });
}

/**
 * Simpele heuristische check: fundamentals zijn "stable" als er
 * positieve marges én ROIC/ROE is **en** geen negatieve revenue
 * growth (TTM). Bewust conservatief — geen gok wanneer data
 * ontbreekt, dan retourneert 'ie `null`.
 */
function deriveFundamentalsStable(
  f: ReturnType<typeof getFundamentals> extends Promise<infer T> ? T : never,
): boolean | null {
  if (!f) return null;
  const operating = f.operatingMargin ?? null;
  const roe = f.roe ?? null;
  const revenueGrowth = f.revenueGrowthTtm ?? null;
  if (operating === null && roe === null && revenueGrowth === null) {
    return null;
  }
  if (operating !== null && operating < 0) return false;
  if (roe !== null && roe < 0) return false;
  if (revenueGrowth !== null && revenueGrowth < -0.1) return false;
  return true;
}
