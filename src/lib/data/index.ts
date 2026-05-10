// Server-side data layer. Bundelt persistence (Prisma) én market data.
// Niets in deze laag mag client-side worden geïmporteerd.

export { prisma } from "./prisma";
export { portfolioRepository } from "./portfolio-repository";
export { huntingListRepository } from "./hunting-list-repository";
export {
  strategyPresetRepository,
  presetToCustomConfig,
  type StrategyPresetRow,
  type SavePresetInput,
} from "./strategy-preset-repository";
export {
  portfolioSnapshotRepository,
  factorSnapshotRepository,
  type PortfolioSnapshotRow,
  type FactorSnapshotRow,
} from "./snapshot-repository";
export { decisionHistoryRepository } from "./decision-history-repository";
export { behavioralStateRepository } from "./behavioral-state-repository";
export { goalRepository } from "./goal-repository";
export {
  transactionRepository,
  type TransactionRow,
  type BulkImportOutcome,
  type ListFilter as TransactionListFilter,
} from "./transaction-repository";
export {
  taxValuationRepository,
  type TaxValuationRow,
} from "./tax-valuation-repository";

// Market data
export { marketDataCache, buildCacheKey, TtlCache } from "./cache";
export { getQuote, getQuotes } from "./quotes";
export { getFxRate, convertAmount } from "./fx";
export { getFundamentals } from "./fundamentals";
export { getHistory, type HistoryQuery } from "./history";
export { fetchRegimeInputs, type RegimeFetchResult } from "./regime";
export {
  getMarketDataProvider,
  type MarketDataProvider,
} from "./providers";
