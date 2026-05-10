/**
 * Public API voor de Macro Regime Engine.
 */

export {
  ASSET_CLASS_LABELS,
  MACRO_INDICATOR_LABELS,
  MACRO_REGIME_DESCRIPTIONS,
  MACRO_REGIME_LABELS,
  type AssetClassImpact,
  type AssetClassKey,
  type AssetClassMapping,
  type ImpactDirection,
  type MacroIndicator,
  type MacroIndicatorKey,
  type MacroRegime,
  type MacroRegimeClassification,
  type MacroRegimeReport,
  type MacroTrend,
  type PortfolioBucketImpact,
  type PortfolioMacroImpact,
} from "./types";
export { classifyMacroRegime } from "./classifier";
export { getAssetMappingForRegime } from "./asset-mapping";
export { computePortfolioMacroImpact } from "./portfolio-impact";
export { runMacroRegimeEngine } from "./engine";
export {
  bucketHoldingToAssetClass,
  buildAssetClassWeights,
} from "./portfolio-classifier";
export { loadMacroRegimeReport } from "./loader";
export {
  CompositeMacroProvider,
  SeedMacroProvider,
  SnapshotMacroProvider,
  type MacroDataProvider,
  type MacroDataSnapshot,
  type MacroProviderId,
  type RawMacroIndicator,
} from "./providers";
