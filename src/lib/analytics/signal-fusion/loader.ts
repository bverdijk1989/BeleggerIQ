/**
 * Server-side loader: hydrateert `SignalFusionInput` voor één ticker
 * uit de bestaande engines (factor-engine, fundamentals, macro-regime,
 * portfolio-view) en draait de fusion-engine.
 *
 * **Externe feeds (earnings_revisions, sentiment, insider/analyst) zijn
 * niet aangesloten** in deze MVP — de extractors handelen `null`-input
 * netjes af. Hook-points zijn voorbereid in `SignalFusionInput`.
 */

import { getFundamentals } from "@/lib/data/fundamentals";

import {
  bucketHoldingToAssetClass,
  loadMacroRegimeReport,
} from "../macro-regime";
import type { PortfolioView } from "../portfolio-view";

import { computeConfidenceScore } from "./engine";
import type {
  SignalFusionInput,
  SignalInstrumentContext,
  SignalPortfolioContext,
} from "./input";
import type { InvestmentConfidenceScore } from "./types";

export interface LoadConfidenceScoreInput {
  ticker: string;
  /** Optionele PortfolioView — wanneer aanwezig vullen we portfolio_fit én proberen we fundamentals + factor-score uit de holding. */
  view?: PortfolioView | null;
}

export async function loadConfidenceScore(
  input: LoadConfidenceScoreInput,
): Promise<InvestmentConfidenceScore> {
  const ticker = input.ticker.trim().toUpperCase();
  const valuation = input.view?.valuations.find(
    (v) => v.holding.ticker.toUpperCase() === ticker,
  );

  // Fundamentals: rechtstreeks via fetcher; faal-safe naar null.
  const fundamentals = await getFundamentals(ticker).catch(() => null);

  const instrument: SignalInstrumentContext = {
    ticker,
    name: valuation?.holding.name ?? ticker,
    sector: valuation?.holding.sector ?? null,
    assetClass: valuation?.holding.assetClass ?? null,
    factorScore: valuation?.holding.factorScore ?? null,
    fundamentals,
    assetClassKey: valuation
      ? bucketHoldingToAssetClass(valuation.holding)
      : null,
  };

  const portfolio: SignalPortfolioContext | null = buildPortfolioContext(
    ticker,
    input.view,
  );

  const macroRegime = await loadMacroRegimeReport({
    view: input.view ?? null,
  }).catch(() => null);

  const fusionInput: SignalFusionInput = {
    instrument,
    portfolio,
    macroRegime,
  };
  return computeConfidenceScore(fusionInput);
}

function buildPortfolioContext(
  ticker: string,
  view: PortfolioView | null | undefined,
): SignalPortfolioContext | null {
  if (!view || view.summary.totalValue <= 0) return null;
  const total = view.summary.totalValue;
  const valuation = view.valuations.find(
    (v) => v.holding.ticker.toUpperCase() === ticker,
  );
  const currentWeight = valuation ? valuation.marketValueBase / total : 0;

  // Sector-aandeel: som van weights in dezelfde sector als deze holding.
  const sector = valuation?.holding.sector ?? null;
  let sectorWeight = 0;
  if (sector) {
    for (const v of view.valuations) {
      if (v.holding.sector === sector) {
        sectorWeight += v.marketValueBase / total;
      }
    }
  }
  return {
    currentWeight,
    sectorWeight,
    positionCount: view.summary.positionCount,
    hhi: view.risk.concentrationHhi ?? 0,
  };
}
