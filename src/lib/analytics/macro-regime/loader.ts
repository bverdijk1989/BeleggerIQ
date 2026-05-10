/**
 * Loader: combineert provider-fetch + engine + portfolio-classifier.
 *
 * **Provider-keuze**:
 *  - Default: `CompositeMacroProvider` (DB-snapshot + seed-fallback).
 *  - Overrideable via `provider`-arg voor tests / alternative bronnen.
 */

import type { PortfolioView } from "../portfolio-view";

import { runMacroRegimeEngine } from "./engine";
import { buildAssetClassWeights } from "./portfolio-classifier";
import { CompositeMacroProvider } from "./providers/composite";
import type { MacroDataProvider } from "./providers/types";
import type { MacroRegimeReport } from "./types";

export interface LoadMacroRegimeReportInput {
  /** Optionele view voor portfolio-impact. */
  view?: PortfolioView | null;
  /** Override provider voor tests. */
  provider?: MacroDataProvider;
}

export async function loadMacroRegimeReport(
  input: LoadMacroRegimeReportInput = {},
): Promise<MacroRegimeReport> {
  const provider = input.provider ?? new CompositeMacroProvider();
  const snapshot = await provider.fetch();
  const weights = input.view ? buildAssetClassWeights(input.view) : undefined;
  return runMacroRegimeEngine({
    snapshot,
    weightsByAssetClass: weights,
  });
}
