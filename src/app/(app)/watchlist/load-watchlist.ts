import { huntingListRepository, prisma } from "@/lib/data";
import { getQuotes } from "@/lib/data/quotes";
import type { Quote } from "@/types/market";
import type { WatchlistItem } from "@/types/watchlist";

/**
 * Loader voor de /watchlist-pagina.
 *
 * Ververvuilt het page-component niet met I/O: deze module trekt het
 * watchlist-object op én verrijkt 'em met:
 *   - meest recente quote (via market-data provider; faalt graceful naar null)
 *   - meest recente FactorSnapshot per ticker (één query)
 *   - simpele rationale-string (waarom deze ticker waarschuwing aan toe is)
 *
 * Pure data-shaping; alle visuals zitten in de page-components.
 */

export interface FactorSummary {
  composite: number | null;
  percentile: number | null;
  asOf: string;
}

export interface EnrichedWatchlistRow {
  item: WatchlistItem;
  quote: Quote | null;
  factor: FactorSummary | null;
  /** Korte beslis-tekst — of null als er nog geen signaal is. */
  rationale: string | null;
}

async function loadLatestFactorByTicker(
  tickers: string[],
): Promise<Map<string, FactorSummary>> {
  if (tickers.length === 0) return new Map();
  // Eén query voor alle tickers; per ticker pakken we de meest recente.
  const rows = await prisma.factorSnapshot.findMany({
    where: { ticker: { in: tickers } },
    orderBy: { capturedAt: "desc" },
  });
  const out = new Map<string, FactorSummary>();
  for (const row of rows) {
    if (out.has(row.ticker)) continue;
    out.set(row.ticker, {
      composite: row.composite !== null ? Number(row.composite) : null,
      percentile: row.percentile !== null ? Number(row.percentile) : null,
      asOf: row.capturedAt.toISOString(),
    });
  }
  return out;
}

function buildRationale(input: {
  item: WatchlistItem;
  quote: Quote | null;
  factor: FactorSummary | null;
}): string | null {
  const bits: string[] = [];

  // Price-alert positionering
  if (input.quote && input.item.targetPrice !== null && input.item.targetPrice !== undefined) {
    const tolerance = input.item.buyZoneTolerance ?? 0.05;
    const lower = input.item.targetPrice;
    const upper = input.item.targetPriceHigh ?? lower * (1 + tolerance);
    if (input.quote.price <= upper && input.quote.price >= lower) {
      bits.push(
        `Prijs ${input.quote.price.toFixed(2)} ${input.quote.currency} valt binnen je koop-zone (${lower.toFixed(2)}–${upper.toFixed(2)}).`,
      );
    } else if (input.quote.price < lower) {
      bits.push(
        `Prijs ${input.quote.price.toFixed(2)} ligt onder je koop-zone — onderzoek of de daling fundamenteel is.`,
      );
    } else {
      const distancePct =
        ((input.quote.price - upper) / upper) * 100;
      bits.push(
        `Prijs zit ${distancePct.toFixed(1)}% boven je koop-zone — wachten tot 'em terugkomt.`,
      );
    }
  }

  // Factor-score signaal
  if (input.factor && input.factor.composite !== null) {
    const score = input.factor.composite;
    if (score >= 0.75) {
      bits.push(`Composite ${(score * 100).toFixed(0)}/100 — sterk profiel.`);
    } else if (score <= 0.4) {
      bits.push(
        `Composite ${(score * 100).toFixed(0)}/100 — fundamentals zijn matig; wees kritisch.`,
      );
    }
  }

  return bits.length > 0 ? bits.join(" ") : null;
}

export async function loadEnrichedWatchlist(
  email: string,
): Promise<EnrichedWatchlistRow[]> {
  const items = await huntingListRepository.listItemsByEmail(email);
  if (items.length === 0) return [];

  const tickers = Array.from(new Set(items.map((i) => i.ticker)));

  const [quotes, factors] = await Promise.all([
    getQuotes(tickers).catch(() => [] as Quote[]),
    loadLatestFactorByTicker(tickers),
  ]);

  const quoteByTicker = new Map<string, Quote>();
  for (const q of quotes) quoteByTicker.set(q.ticker, q);

  return items
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
    .map((item) => {
      const quote = quoteByTicker.get(item.ticker) ?? null;
      const factor = factors.get(item.ticker) ?? null;
      return {
        item,
        quote,
        factor,
        rationale: buildRationale({ item, quote, factor }),
      };
    });
}
