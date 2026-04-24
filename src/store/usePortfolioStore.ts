"use client";

import { create } from "zustand";

import type { AllocationPlan } from "@/types/allocation";
import type { FactorScore } from "@/types/factor";
import type { Holding, Portfolio } from "@/types/portfolio";
import type { PortfolioRiskSummary, PositionRiskAnalysis } from "@/types/risk";
import type { PortfolioSummary } from "@/types/summary";
import type { WatchlistItem } from "@/types/watchlist";

/**
 * Portfolio store.
 *
 * State boundaries:
 *  - Server-truth data (portfolios, watchlist, samenvatting, risk & factor
 *    caches) wordt elke sessie vers gehydrateerd. Niets hier wordt persisted.
 *  - Holdings leven binnen `portfolios[].holdings`; we dupliceren ze niet.
 *    Gebruik `selectActiveHoldings` als read-through helper.
 *  - Factor- en risk-analyses worden per ticker gecached om vakjes in
 *    screener, portfolio table en maandbeslissing snel te vullen zonder
 *    round-trips.
 */

type FactorScoreByTicker = Record<string, FactorScore>;
type PositionRiskByTicker = Record<string, PositionRiskAnalysis>;

interface PortfolioStateValues {
  portfolios: Portfolio[];
  activePortfolioId: string | null;

  watchlist: WatchlistItem[];

  summary: PortfolioSummary | null;
  portfolioRisk: PortfolioRiskSummary | null;
  factorScoresByTicker: FactorScoreByTicker;
  positionRisksByTicker: PositionRiskByTicker;

  latestAllocationPlan: AllocationPlan | null;
  /** ISO timestamp van de laatst uitgevoerde portfolio-analyse. */
  lastAnalyzedAt: string | null;

  isLoading: boolean;
  error: string | null;
}

interface PortfolioStateActions {
  // Hydratatie
  hydrate: (payload: {
    portfolios: Portfolio[];
    watchlist?: WatchlistItem[];
    summary?: PortfolioSummary | null;
    portfolioRisk?: PortfolioRiskSummary | null;
  }) => void;

  // Portfolios
  setPortfolios: (portfolios: Portfolio[]) => void;
  setActivePortfolio: (id: string | null) => void;

  // Summary / risk
  setSummary: (summary: PortfolioSummary | null) => void;
  setPortfolioRisk: (risk: PortfolioRiskSummary | null) => void;

  // Factor cache
  setFactorScores: (scores: FactorScore[]) => void;
  upsertFactorScore: (score: FactorScore) => void;

  // Position risk cache
  setPositionRisks: (risks: PositionRiskAnalysis[]) => void;
  upsertPositionRisk: (risk: PositionRiskAnalysis) => void;

  // Watchlist
  setWatchlist: (items: WatchlistItem[]) => void;
  upsertWatchlistItem: (item: WatchlistItem) => void;
  removeWatchlistItem: (ticker: string) => void;

  // Allocation
  setAllocationPlan: (plan: AllocationPlan | null) => void;

  // Analyse timestamping
  markAnalyzed: (at?: string) => void;

  // Lifecycle
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type PortfolioStore = PortfolioStateValues & PortfolioStateActions;

const INITIAL: PortfolioStateValues = {
  portfolios: [],
  activePortfolioId: null,
  watchlist: [],
  summary: null,
  portfolioRisk: null,
  factorScoresByTicker: {},
  positionRisksByTicker: {},
  latestAllocationPlan: null,
  lastAnalyzedAt: null,
  isLoading: false,
  error: null,
};

function pickActiveId(
  portfolios: Portfolio[],
  currentId: string | null,
): string | null {
  if (currentId && portfolios.some((p) => p.id === currentId)) return currentId;
  return portfolios.find((p) => p.isPrimary)?.id ?? portfolios[0]?.id ?? null;
}

function indexBy<T>(items: T[], key: (item: T) => string): Record<string, T> {
  const record: Record<string, T> = {};
  for (const item of items) {
    record[key(item)] = item;
  }
  return record;
}

export const usePortfolioStore = create<PortfolioStore>((set) => ({
  ...INITIAL,

  hydrate: ({ portfolios, watchlist, summary, portfolioRisk }) =>
    set((state) => ({
      portfolios,
      activePortfolioId: pickActiveId(portfolios, state.activePortfolioId),
      watchlist: watchlist ?? state.watchlist,
      summary: summary ?? state.summary,
      portfolioRisk: portfolioRisk ?? state.portfolioRisk,
      isLoading: false,
      error: null,
    })),

  setPortfolios: (portfolios) =>
    set((state) => ({
      portfolios,
      activePortfolioId: pickActiveId(portfolios, state.activePortfolioId),
    })),

  setActivePortfolio: (id) => set({ activePortfolioId: id }),

  setSummary: (summary) => set({ summary }),
  setPortfolioRisk: (portfolioRisk) => set({ portfolioRisk }),

  setFactorScores: (scores) =>
    set({ factorScoresByTicker: indexBy(scores, (s) => s.ticker) }),
  upsertFactorScore: (score) =>
    set((state) => ({
      factorScoresByTicker: {
        ...state.factorScoresByTicker,
        [score.ticker]: score,
      },
    })),

  setPositionRisks: (risks) =>
    set({ positionRisksByTicker: indexBy(risks, (r) => r.ticker) }),
  upsertPositionRisk: (risk) =>
    set((state) => ({
      positionRisksByTicker: {
        ...state.positionRisksByTicker,
        [risk.ticker]: risk,
      },
    })),

  setWatchlist: (items) => set({ watchlist: items }),
  upsertWatchlistItem: (item) =>
    set((state) => {
      const index = state.watchlist.findIndex(
        (existing) => existing.ticker === item.ticker,
      );
      if (index === -1) return { watchlist: [...state.watchlist, item] };
      const next = state.watchlist.slice();
      next[index] = item;
      return { watchlist: next };
    }),
  removeWatchlistItem: (ticker) =>
    set((state) => ({
      watchlist: state.watchlist.filter((item) => item.ticker !== ticker),
    })),

  setAllocationPlan: (latestAllocationPlan) => set({ latestAllocationPlan }),

  markAnalyzed: (at) => set({ lastAnalyzedAt: at ?? new Date().toISOString() }),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set(INITIAL),
}));

// ============================================================
//  Selectors (pure, gebruiksklaar met `useStore(selector)`)
// ============================================================

export function selectActivePortfolio(
  state: PortfolioStore,
): Portfolio | null {
  if (!state.activePortfolioId) return null;
  return (
    state.portfolios.find((p) => p.id === state.activePortfolioId) ?? null
  );
}

export function selectActiveHoldings(state: PortfolioStore): Holding[] {
  return selectActivePortfolio(state)?.holdings ?? [];
}

export function selectFactorScoreForTicker(
  state: PortfolioStore,
  ticker: string,
): FactorScore | undefined {
  return state.factorScoresByTicker[ticker];
}

export function selectPositionRiskForTicker(
  state: PortfolioStore,
  ticker: string,
): PositionRiskAnalysis | undefined {
  return state.positionRisksByTicker[ticker];
}
