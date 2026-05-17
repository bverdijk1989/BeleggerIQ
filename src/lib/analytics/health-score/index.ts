/**
 * Public API voor de Portfolio Health Score module.
 *
 * Page-level kan via `loadPortfolioHealthScore` in één call de
 * volledige score (totaal + breakdown + recommendations) ophalen.
 * Voor unit-tests of synthetische input is `computePortfolioHealthScore`
 * direct beschikbaar.
 */

export { computePortfolioHealthScore, computeDataQualityScore } from "./engine";
export { loadPortfolioHealthScore, type BuildHealthScoreInput } from "./loader";
export type { PortfolioHealthInput } from "./loader-types";
export {
  DEFAULT_HEALTH_WEIGHTS,
  HEALTH_COMPONENT_LABELS,
  HEALTH_COMPONENT_LABELS_EN,
  type DataQualityTier,
  type HealthComponent,
  type HealthComponentKey,
  type HealthComponentStatus,
  type HealthGrade,
  type HealthRecommendation,
  type PortfolioHealthDataQuality,
  type PortfolioHealthScore,
} from "./types";
