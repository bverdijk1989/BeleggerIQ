/**
 * Signal Performance — server-side loader (Module 27).
 *
 * Leest historische `FactorSnapshot`-rijen + paart ze met forward-returns
 * uit `getHistory` per ticker. Bij weinig data (typisch in pilot-fase)
 * geeft het rapport een expliciete sample-size warning — geen
 * verzonnen statistieken.
 *
 * **Mapping FactorSnapshot → SignalComponentKey**:
 *  - quality       ← qualityScore (×100)
 *  - valuation     ← valueScore (×100)
 *  - momentum      ← momentumScore (×100)
 *  - volatility    ← lowVolScore (×100)  (NB: bestaand veld is "lowVol" → hoger = veiliger)
 *  - macrofit      ← afgeleid uit MarketSnapshot.regimeLabel (nu null, marker voor v2)
 *  - portfoliofit  ← null (geen historische portfolio-context per ticker)
 *
 * Macrofit en portfoliofit blijven in v1 vooral `null` — beide vereisen
 * meer context dan FactorSnapshot biedt. De UI maakt expliciet dat ze
 * "in voorbereiding zijn" zodat geen overcommittering ontstaat.
 */

import { prisma } from "@/lib/data/prisma";
import { getHistory } from "@/lib/data/history";
import { log } from "@/lib/log";

import { buildSignalPerformanceReport } from "./engine";
import type {
  RegimeBucket,
  ReturnHorizon,
  SignalObservation,
  SignalPerformanceReport,
} from "./types";

const HORIZON_DAYS: Record<ReturnHorizon, number> = {
  "1m": 22,
  "3m": 66,
  "6m": 132,
  "12m": 252,
};

export interface LoadSignalPerformanceInput {
  /** Aantal kalenderdagen historie meenemen — default 730 (2 jaar). */
  lookbackDays?: number;
  /** Optioneel: limiet op aantal snapshots — beschermt loader bij groei. */
  maxSnapshots?: number;
}

export async function loadSignalPerformanceReport(
  input: LoadSignalPerformanceInput = {},
): Promise<SignalPerformanceReport> {
  const generatedAt = new Date().toISOString();
  const lookbackDays = input.lookbackDays ?? 730;
  const maxSnapshots = input.maxSnapshots ?? 2000;

  try {
    const since = new Date(Date.now() - lookbackDays * 86_400_000);
    const snapshots = await prisma.factorSnapshot
      .findMany({
        where: { capturedAt: { gte: since } },
        orderBy: { capturedAt: "asc" },
        take: maxSnapshots,
      })
      .catch(() => []);

    if (snapshots.length === 0) {
      return buildSignalPerformanceReport({
        observations: [],
        generatedAt,
      });
    }

    // Group by ticker — fetch history once per ticker.
    const tickerSet = Array.from(
      new Set(snapshots.map((s) => s.ticker.toUpperCase())),
    );

    const historyByTicker = new Map<
      string,
      Array<{ date: Date; close: number }>
    >();

    await Promise.all(
      tickerSet.map(async (t) => {
        try {
          const startDate = since.toISOString().slice(0, 10);
          const endDate = new Date().toISOString().slice(0, 10);
          const points = await getHistory({
            ticker: t,
            startDate,
            endDate,
            interval: "1d",
          });
          const sorted = points
            .map((p) => ({ date: new Date(p.date), close: p.close }))
            .filter((p) => Number.isFinite(p.close) && p.close > 0)
            .sort((a, b) => a.date.getTime() - b.date.getTime());
          historyByTicker.set(t, sorted);
        } catch (error) {
          log.info("signal-performance", "history_fetch_failed", {
            ticker: t,
            errorName: error instanceof Error ? error.name : "unknown",
          });
          historyByTicker.set(t, []);
        }
      }),
    );

    // Bouw observations per snapshot
    const observations: SignalObservation[] = [];
    for (const snap of snapshots) {
      const ticker = snap.ticker.toUpperCase();
      const history = historyByTicker.get(ticker) ?? [];
      if (history.length === 0) continue;

      const asOf = snap.capturedAt;
      const closeAtSnapshot = findClosestClose(history, asOf);
      if (closeAtSnapshot === null) continue;

      const forwardReturns: Partial<Record<ReturnHorizon, number | null>> = {};
      for (const h of ["1m", "3m", "6m", "12m"] as ReturnHorizon[]) {
        const target = new Date(
          asOf.getTime() + HORIZON_DAYS[h] * 86_400_000,
        );
        const futureClose = findClosestClose(history, target);
        if (futureClose === null) {
          forwardReturns[h] = null;
        } else {
          forwardReturns[h] = futureClose / closeAtSnapshot - 1;
        }
      }

      observations.push({
        ticker,
        asOf: asOf.toISOString(),
        scores: {
          quality: scaleScore(snap.qualityScore),
          valuation: scaleScore(snap.valueScore),
          momentum: scaleScore(snap.momentumScore),
          volatility: scaleScore(snap.lowVolScore),
          // macrofit + portfoliofit komen v2 — vereisen extra context.
          macrofit: null,
          portfoliofit: null,
        },
        regime: "UNKNOWN" as RegimeBucket,
        forwardReturns,
      });
    }

    return buildSignalPerformanceReport({
      observations,
      generatedAt,
    });
  } catch (error) {
    log.warn("signal-performance", "load_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return buildSignalPerformanceReport({
      observations: [],
      generatedAt,
    });
  }
}

function scaleScore(decimal: unknown): number | null {
  // FactorSnapshot.qualityScore etc. zijn 0..1 decimals. UI gebruikt 0..100.
  if (decimal === null || decimal === undefined) return null;
  const n =
    typeof decimal === "number"
      ? decimal
      : typeof decimal === "object" && decimal !== null && "toNumber" in decimal
        ? (decimal as { toNumber: () => number }).toNumber()
        : Number(decimal);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n * 100)));
}

function findClosestClose(
  history: ReadonlyArray<{ date: Date; close: number }>,
  target: Date,
): number | null {
  if (history.length === 0) return null;
  const targetMs = target.getTime();
  let best: { delta: number; close: number } | null = null;
  for (const p of history) {
    const delta = Math.abs(p.date.getTime() - targetMs);
    if (best === null || delta < best.delta) {
      best = { delta, close: p.close };
    }
  }
  // Tolerantie 7 dagen om weekends/feestdagen op te vangen.
  if (best && best.delta <= 7 * 86_400_000) return best.close;
  return null;
}
