/**
 * Data-Depth Engine — public API (Module 26).
 */

export {
  applyDataDepthToConfidence,
  assessPortfolioCoverage,
  computeAssetDataDepth,
  tierFromScore,
  type AssessPortfolioCoverageInput,
  type AssetDataDepthInput,
} from "./engine";
export {
  DIMENSION_LABELS,
  DIMENSION_WEIGHTS,
  TIER_EXPLANATIONS,
  TIER_LABELS,
  type AssetDataDepth,
  type DataDepthDimension,
  type DataDepthTier,
  type PortfolioDataCoverage,
} from "./types";
