import type { Currency } from "@/types/common";
import type { FactorScore } from "@/types/factor";
import type { HistoricalPoint, Quote } from "@/types/market";
import type { MarketRegimeScore } from "@/types/regime";
import type { WatchlistItem } from "@/types/watchlist";

import { buildCandidate } from "./scoring";
import {
  detectDefensiveBargain,
  detectEarningsSentiment,
  detectEtfCoreRebalance,
  detectMomentumReversal,
  detectQualityPullback,
  detectUnderweightConviction,
  detectValueDislocation,
  detectWatchlistTarget,
} from "./signals";
import {
  OPPORTUNITY_SIGNAL_TYPES,
  type OpportunityCandidate,
  type OpportunityReport,
  type OpportunitySignal,
  type OpportunitySignalType,
} from "./types";

/**
 * Orchestrator voor de Opportunity Radar.
 *
 * Pure functie, geen I/O. Callers verzamelen drie input-bronnen en
 * geven ze door:
 *   1. **Portfolio-holdings** (met factor-scores + price history +
 *      huidige weight vs target) → signalen 1, 3, 5, 6, 7.
 *   2. **Screener-universum** (brede pool met factor-scores) →
 *      signalen 1, 2, 3, 7. Output `source: "screener"`.
 *   3. **Watchlist-items** (met optionele targetPrice + quote) →
 *      signaal 4 (watchlist target).
 *
 * Belangrijke design-regels:
 *   - Geen trade-beslissing; we geven alleen signalen met strength,
 *     confidence, rationale en risicoNote. De UI en de gebruiker
 *     beslissen.
 *   - Elk signaal is optioneel: als de benodigde data ontbreekt, skipt
 *     de engine dat signaal voor dat item. Geen gokken.
 *   - Deduplicatie op ticker: wanneer een ticker zowel in portfolio als
 *     op de watchlist staat, bundelen we de signalen in één candidate
 *     (portfolio-source heeft voorrang voor display).
 */

export interface PortfolioCandidateInput {
  ticker: string;
  name: string;
  isin?: string | null;
  currentWeight?: number | null; // fractie
  targetWeight?: number | null; // fractie
  factorScore?: FactorScore | null;
  priceHistory?: HistoricalPoint[] | null;
  quote?: Quote | null;
  /** True wanneer instrument-classifier dit als broad-market ETF zag. */
  isBroadMarketEtf?: boolean;
}

export interface ScreenerCandidateInput {
  ticker: string;
  name: string;
  isin?: string | null;
  factorScore?: FactorScore | null;
  priceHistory?: HistoricalPoint[] | null;
  quote?: Quote | null;
}

export interface WatchlistCandidateInput {
  item: WatchlistItem;
  quote?: Quote | null;
}

export interface ScanOpportunitiesInput {
  portfolio?: PortfolioCandidateInput[];
  screener?: ScreenerCandidateInput[];
  watchlist?: WatchlistCandidateInput[];
  regime?: MarketRegimeScore | null;
  /**
   * Configuratie. Default: `minSignalStrength = 40`, `maxCandidates = 20`.
   * Callers kunnen strikter zijn op `/kansen` (meer kandidaten tonen) en
   * losser op het dashboard (alleen top-3).
   */
  config?: {
    minSignalStrength?: number;
    maxCandidates?: number;
    /**
     * Override "nu" — ISO-timestamp. Maakt de scan volledig
     * reproduceerbaar (deterministisch) zodat dezelfde input altijd
     * dezelfde output geeft, incl. `scannedAt` en `signal.detectedAt`.
     * Default: `new Date().toISOString()`.
     */
    now?: string;
  };
}

export function scanOpportunities(
  input: ScanOpportunitiesInput,
): OpportunityReport {
  const config = input.config ?? {};
  // Eén consistente timestamp voor de hele scan — `config.now` maakt 'em
  // injecteerbaar zodat de engine echt deterministisch is (Simons-laag).
  const scannedAt = config.now ?? new Date().toISOString();
  const minSignalStrength = config.minSignalStrength ?? 40;
  const maxCandidates = config.maxCandidates ?? 20;

  const portfolioHoldings = input.portfolio ?? [];
  const screener = input.screener ?? [];
  const watchlist = input.watchlist ?? [];

  // Map per ticker om signalen te bundelen. Source gaat van
  // screener → watchlist → portfolio (portfolio wint bij conflict).
  const byTicker = new Map<
    string,
    {
      ticker: string;
      name: string;
      isin: string | null;
      currentPrice: number | null;
      currency: Currency | null;
      signals: OpportunitySignal[];
      source: OpportunityCandidate["source"];
    }
  >();

  function upsert(
    key: string,
    patch: Partial<NonNullable<ReturnType<typeof byTicker.get>>> &
      Pick<NonNullable<ReturnType<typeof byTicker.get>>, "ticker" | "name">,
    signals: OpportunitySignal[],
  ): void {
    const existing = byTicker.get(key);
    if (existing) {
      existing.signals.push(...signals);
      if (
        patch.source === "portfolio" ||
        (patch.source === "watchlist" && existing.source === "screener")
      ) {
        existing.source = patch.source;
      }
      if (patch.currentPrice !== undefined && existing.currentPrice === null) {
        existing.currentPrice = patch.currentPrice;
      }
      if (patch.currency !== undefined && existing.currency === null) {
        existing.currency = patch.currency;
      }
      if (patch.isin !== undefined && existing.isin === null) {
        existing.isin = patch.isin ?? null;
      }
      return;
    }
    byTicker.set(key, {
      ticker: patch.ticker,
      name: patch.name,
      isin: patch.isin ?? null,
      currentPrice: patch.currentPrice ?? null,
      currency: patch.currency ?? null,
      source: patch.source ?? "screener",
      signals: [...signals],
    });
  }

  // --- 1. Portfolio holdings ---
  for (const h of portfolioHoldings) {
    const signals: OpportunitySignal[] = [];
    push(signals, detectQualityPullback({ factorScore: h.factorScore, priceHistory: h.priceHistory }));
    push(signals, detectValueDislocation({ factorScore: h.factorScore }));
    push(signals, detectMomentumReversal({ priceHistory: h.priceHistory }));
    push(
      signals,
      detectUnderweightConviction({
        factorScore: h.factorScore,
        currentWeight: h.currentWeight,
        targetWeight: h.targetWeight,
      }),
    );
    push(
      signals,
      detectEtfCoreRebalance({
        isBroadMarketEtf: h.isBroadMarketEtf ?? false,
        currentWeight: h.currentWeight,
        targetWeight: h.targetWeight,
      }),
    );
    push(
      signals,
      detectDefensiveBargain({
        factorScore: h.factorScore,
        priceHistory: h.priceHistory,
        regime: input.regime ?? null,
      }),
    );
    push(signals, detectEarningsSentiment());

    if (signals.length > 0) {
      upsert(
        h.ticker,
        {
          ticker: h.ticker,
          name: h.name,
          isin: h.isin ?? null,
          currentPrice: h.quote?.price ?? null,
          currency: h.quote?.currency ?? null,
          source: "portfolio",
        },
        signals,
      );
    }
  }

  // --- 2. Screener-universum ---
  for (const s of screener) {
    const signals: OpportunitySignal[] = [];
    push(signals, detectQualityPullback({ factorScore: s.factorScore, priceHistory: s.priceHistory }));
    push(signals, detectValueDislocation({ factorScore: s.factorScore }));
    push(signals, detectMomentumReversal({ priceHistory: s.priceHistory }));
    push(
      signals,
      detectDefensiveBargain({
        factorScore: s.factorScore,
        priceHistory: s.priceHistory,
        regime: input.regime ?? null,
      }),
    );
    push(signals, detectEarningsSentiment());

    if (signals.length > 0) {
      upsert(
        s.ticker,
        {
          ticker: s.ticker,
          name: s.name,
          isin: s.isin ?? null,
          currentPrice: s.quote?.price ?? null,
          currency: s.quote?.currency ?? null,
          source: "screener",
        },
        signals,
      );
    }
  }

  // --- 3. Watchlist ---
  for (const w of watchlist) {
    const target = w.item.targetPrice ?? null;
    const current = w.quote?.price ?? null;
    const signal = detectWatchlistTarget({
      targetPrice: target,
      currentPrice: current,
    });
    if (signal) {
      upsert(
        w.item.ticker,
        {
          ticker: w.item.ticker,
          name: w.item.name ?? w.item.ticker,
          isin: null,
          currentPrice: current,
          currency: w.quote?.currency ?? null,
          source: "watchlist",
        },
        [signal],
      );
    }
  }

  // --- Bouw kandidaten + sorteer ---
  const candidates: OpportunityCandidate[] = [];
  for (const entry of byTicker.values()) {
    const candidate = buildCandidate(
      {
        ticker: entry.ticker,
        name: entry.name,
        isin: entry.isin,
        source: entry.source,
        signals: entry.signals,
        currentPrice: entry.currentPrice,
        currency: entry.currency,
      },
      { minSignalStrength },
    );
    if (candidate) candidates.push(candidate);
  }

  // Sorteer op score desc; tie-break op aantal signalen, daarna alfabetisch.
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.signals.length !== a.signals.length) return b.signals.length - a.signals.length;
    return a.ticker.localeCompare(b.ticker);
  });
  const topCandidates = candidates.slice(0, maxCandidates);

  // Normaliseer elk `signal.detectedAt` naar de ene scan-timestamp.
  // De per-signal builders gebruiken `new Date()` intern; dat maakte
  // twee identieke scans non-deterministisch. Eén consistente waarde
  // garandeert reproduceerbaarheid (Simons-laag) zonder de 7 signal-
  // builders te hoeven herschrijven.
  for (const c of topCandidates) {
    for (const s of c.signals) {
      s.detectedAt = scannedAt;
    }
  }

  // Signaal-distributie over de *uiteindelijk getoonde* kandidaten.
  const distribution: Record<OpportunitySignalType, number> = {
    "quality-pullback": 0,
    "value-dislocation": 0,
    "momentum-reversal": 0,
    "watchlist-target": 0,
    "underweight-high-conviction": 0,
    "etf-core-rebalance": 0,
    "defensive-bargain": 0,
    "earnings-sentiment-placeholder": 0,
  };
  for (const c of topCandidates) {
    for (const s of c.signals) {
      distribution[s.type] += 1;
    }
  }
  // Sanity: houd distribution keys altijd compleet.
  for (const t of OPPORTUNITY_SIGNAL_TYPES) {
    if (!(t in distribution)) distribution[t] = 0;
  }

  return {
    scannedAt,
    candidateCount: topCandidates.length,
    candidates: topCandidates,
    signalDistribution: distribution,
    sourcesScanned: {
      portfolioHoldings: portfolioHoldings.length,
      screenerCandidates: screener.length,
      watchlistItems: watchlist.length,
    },
  };
}

// ============================================================
//  Helpers
// ============================================================

function push(out: OpportunitySignal[], s: OpportunitySignal | null): void {
  if (s) out.push(s);
}
