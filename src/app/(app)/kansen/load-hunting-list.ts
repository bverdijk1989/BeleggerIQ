import {
  evaluateHuntingList,
  isTriggerExpired,
  type HuntingHistoryEntry,
  type HuntingListReport,
} from "@/lib/analytics/hunting-list";
import { getFundamentals } from "@/lib/data/fundamentals";
import { getQuotes } from "@/lib/data/quotes";
import { huntingListRepository } from "@/lib/data";
import { log } from "@/lib/log";

/**
 * Server-only data-loader voor de Hunting List.
 *
 * Pipeline:
 *   1. Fetch watchlist-items van de ingelogde user.
 *   2. Parallel-fetch quotes + fundamentals + recent history-logs.
 *   3. Draai de `evaluateHuntingList`-engine (pure).
 *   4. Persist nieuwe actieve triggers idempotent in `HuntingSignalLog`
 *      (skip als er al een niet-verlopen log van hetzelfde type is).
 *
 * De persistentie-stap faalt graceful: als Prisma/DB ergens hapert,
 * loggen we een warning maar leveren we nog steeds de (in-memory)
 * report aan de UI.
 */

export interface LoadHuntingListInput {
  userEmail: string;
  config?: {
    targetSignalTtlDays?: number;
    valuationSignalTtlDays?: number;
    historyLimit?: number;
  };
}

export interface LoadHuntingListResult {
  report: HuntingListReport;
  persistedNewSignals: number;
}

export async function loadHuntingListReport(
  input: LoadHuntingListInput,
): Promise<LoadHuntingListResult> {
  const historyLimit = input.config?.historyLimit ?? 200;

  const userId = await huntingListRepository.resolveUserIdByEmail(
    input.userEmail,
  );
  if (!userId) {
    return {
      report: evaluateHuntingList({
        entries: [],
        config: input.config,
      }),
      persistedNewSignals: 0,
    };
  }

  const [items, historyByTicker] = await Promise.all([
    huntingListRepository.listItemsByEmail(input.userEmail),
    huntingListRepository
      .listRecentHistoryForUser(userId, historyLimit)
      .catch((err): Map<string, HuntingHistoryEntry[]> => {
        log.warn("hunting-list:load", "history-fetch faalde — lever lege map", {
          err,
        });
        return new Map<string, HuntingHistoryEntry[]>();
      }),
  ]);

  if (items.length === 0) {
    return {
      report: evaluateHuntingList({ entries: [], config: input.config }),
      persistedNewSignals: 0,
    };
  }

  const tickers = items.map((i) => i.ticker);
  const [quotes, fundamentalsList] = await Promise.all([
    getQuotes(tickers).catch(() => []),
    Promise.all(
      tickers.map((t) => getFundamentals(t).catch(() => null)),
    ),
  ]);
  const quoteByTicker = new Map(quotes.map((q) => [q.ticker, q]));
  const fundamentalsByTicker = new Map(
    tickers.map((t, i) => [t, fundamentalsList[i] ?? null]),
  );

  const entries = items.map((item) => ({
    item,
    quote: quoteByTicker.get(item.ticker) ?? null,
    fundamentals: fundamentalsByTicker.get(item.ticker) ?? null,
    history: historyByTicker.get(item.ticker) ?? [],
  }));

  const report = evaluateHuntingList({
    entries,
    config: input.config,
  });

  // Persist nieuwe actieve triggers. Idempotent: de repository checkt
  // of een niet-verlopen log van hetzelfde type al bestaat.
  let persisted = 0;
  for (const it of report.items) {
    for (const t of it.triggers) {
      if (isTriggerExpired(t, report.scannedAt)) continue;
      try {
        const written = await huntingListRepository.upsertActiveSignal({
          userId,
          watchlistItemId: it.id,
          ticker: it.ticker,
          triggerType: t.type,
          severity: t.severity,
          price: t.snapshot.price,
          currency: it.currency,
          pe: t.snapshot.pe,
          fcfYield: t.snapshot.fcfYield,
          rationale: t.rationale,
          note: it.note,
          firedAt: t.firedAt,
          expiresAt: t.expiresAt,
        });
        if (written) persisted += 1;
      } catch (err) {
        log.warn(
          "hunting-list:load",
          "upsertActiveSignal faalde — trigger blijft in-memory",
          { err, ticker: it.ticker, type: t.type },
        );
      }
    }
  }

  return { report, persistedNewSignals: persisted };
}
