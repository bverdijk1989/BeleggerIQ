/**
 * Macro-Regime engine — combineert classifier + asset-mapping +
 * portfolio-impact tot één `MacroRegimeReport`.
 *
 * **Pure functie**: zelfde input → identieke output.
 */

import { getAssetMappingForRegime } from "./asset-mapping";
import { classifyMacroRegime } from "./classifier";
import { computePortfolioMacroImpact } from "./portfolio-impact";
import type { MacroDataSnapshot } from "./providers/types";
import type {
  AssetClassKey,
  MacroRegimeReport,
} from "./types";

export interface RunMacroRegimeEngineInput {
  snapshot: MacroDataSnapshot;
  /** Optioneel: huidige weging per asset-class voor portfolio-impact. */
  weightsByAssetClass?: Map<AssetClassKey, number>;
}

export function runMacroRegimeEngine(
  input: RunMacroRegimeEngineInput,
): MacroRegimeReport {
  const classification = classifyMacroRegime({
    rawIndicators: input.snapshot.indicators,
    asOf: input.snapshot.asOf,
  });
  const assetMapping = getAssetMappingForRegime(classification.regime);
  const portfolioImpact = input.weightsByAssetClass
    ? computePortfolioMacroImpact({
        regime: classification.regime,
        weightsByAssetClass: input.weightsByAssetClass,
        assetMapping,
      })
    : null;
  return { classification, assetMapping, portfolioImpact };
}
