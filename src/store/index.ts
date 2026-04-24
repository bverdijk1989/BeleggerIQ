// Barrel voor client-side stores.
// Elke store woont in zijn eigen bestand en wordt hier geherexporteerd
// zodat consumers één vindbaar importpad hebben: `@/store`.

export {
  usePortfolioStore,
  selectActivePortfolio,
  selectActiveHoldings,
  selectFactorScoreForTicker,
  selectPositionRiskForTicker,
  type PortfolioStore,
} from "./usePortfolioStore";

export {
  useProfileStore,
  selectIsProfileComplete,
  type ProfileStore,
} from "./useProfileStore";

export {
  useAppSettingsStore,
  DEFAULT_BENCHMARK_TICKER,
  type AppSettingsStore,
  type ThemeMode,
  type DisplayDensity,
} from "./useAppSettingsStore";
