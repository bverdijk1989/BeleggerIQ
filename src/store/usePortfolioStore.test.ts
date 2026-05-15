import { beforeEach, describe, expect, it } from "vitest";

import {
  selectActiveHoldings,
  selectActivePortfolio,
  selectFactorScoreForTicker,
  usePortfolioStore,
} from "./usePortfolioStore";
import type { Portfolio } from "@/types/portfolio";
import type { FactorScore } from "@/types/factor";
import type { WatchlistItem } from "@/types/watchlist";

function makePortfolio(id: string, isPrimary = false): Portfolio {
  return {
    id,
    userId: "u1",
    name: id,
    baseCurrency: "EUR",
    isPrimary,
    cashBalance: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    holdings: [
      {
        id: `${id}-h1`,
        portfolioId: id,
        ticker: "ASML",
        name: "ASML",
        assetClass: "EQUITY",
        currency: "EUR",
        quantity: 1,
        avgCostPrice: 500,
        currentPrice: 600,
      },
    ],
  };
}

beforeEach(() => {
  usePortfolioStore.getState().reset();
});

describe("usePortfolioStore", () => {
  it("kiest primary portfolio als er geen actieve is", () => {
    usePortfolioStore
      .getState()
      .setPortfolios([makePortfolio("a"), makePortfolio("b", true)]);
    expect(usePortfolioStore.getState().activePortfolioId).toBe("b");
  });

  it("behoudt de actieve id zolang die blijft bestaan", () => {
    const { setPortfolios, setActivePortfolio } = usePortfolioStore.getState();
    setPortfolios([makePortfolio("a"), makePortfolio("b", true)]);
    setActivePortfolio("a");
    setPortfolios([makePortfolio("a"), makePortfolio("c")]);
    expect(usePortfolioStore.getState().activePortfolioId).toBe("a");
  });

  it("selectActiveHoldings retourneert de holdings van de active portfolio", () => {
    usePortfolioStore.getState().setPortfolios([makePortfolio("a", true)]);
    expect(selectActiveHoldings(usePortfolioStore.getState())).toHaveLength(1);
  });

  it("indexeert factor scores per ticker en ondersteunt upsert", () => {
    const base: FactorScore = {
      ticker: "ASML",
      asOf: "2026-04-01T00:00:00.000Z",
      subScores: { value: 0, quality: 0.5, momentum: 0.3, lowVol: 0.1 },
      composite: 0.3,
    };
    usePortfolioStore.getState().setFactorScores([base]);
    expect(
      selectFactorScoreForTicker(usePortfolioStore.getState(), "ASML")
        ?.composite,
    ).toBe(0.3);

    usePortfolioStore
      .getState()
      .upsertFactorScore({ ...base, composite: 0.42 });
    expect(
      selectFactorScoreForTicker(usePortfolioStore.getState(), "ASML")
        ?.composite,
    ).toBe(0.42);
  });

  it("upsert + remove op watchlist werkt op ticker-niveau", () => {
    const item: WatchlistItem = {
      id: "w1",
      userId: "u1",
      ticker: "NVDA",
      addedAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z",
    };

    usePortfolioStore.getState().upsertWatchlistItem(item);
    expect(usePortfolioStore.getState().watchlist).toHaveLength(1);

    usePortfolioStore
      .getState()
      .upsertWatchlistItem({ ...item, note: "Herzien" });
    expect(usePortfolioStore.getState().watchlist).toHaveLength(1);
    expect(usePortfolioStore.getState().watchlist[0]?.note).toBe("Herzien");

    usePortfolioStore.getState().removeWatchlistItem("NVDA");
    expect(usePortfolioStore.getState().watchlist).toHaveLength(0);
  });

  it("markAnalyzed zet een ISO timestamp", () => {
    usePortfolioStore.getState().markAnalyzed("2026-04-01T12:00:00.000Z");
    expect(usePortfolioStore.getState().lastAnalyzedAt).toBe(
      "2026-04-01T12:00:00.000Z",
    );
  });

  it("hydrate vult portfolios, watchlist en summary in één slag", () => {
    usePortfolioStore.getState().hydrate({
      portfolios: [makePortfolio("a", true)],
      watchlist: [
        {
          id: "w1",
          userId: "u1",
          ticker: "PEP",
          addedAt: "2026-04-01T00:00:00.000Z",
          updatedAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    });
    const state = usePortfolioStore.getState();
    expect(state.portfolios).toHaveLength(1);
    expect(selectActivePortfolio(state)?.id).toBe("a");
    expect(state.watchlist[0]?.ticker).toBe("PEP");
    expect(state.isLoading).toBe(false);
  });
});
