import type { FactorScore, FactorWeights } from "@/types/factor";
import type { AssetClass } from "@/types/portfolio";
import type { InvestmentObjective } from "@/types/profile";

import {
  scoreEtfFactors,
  type EtfMetadata,
} from "../etf-factors";

import {
  DEFAULT_FACTOR_WEIGHTS,
  scoreFactors,
  type FactorScoringInput,
} from "./composite";

/**
 * Asset-class-aware factor-router.
 *
 * **Reden:** een ETF is geen bedrijf. ROIC, P/E, FCF-yield bestaan niet
 * op fonds-niveau. Tot deze router liep elk holding via dezelfde
 * `scoreFactors`-functie en kreeg ETF dus een neutrale-met-data-gap
 * score (composite ~50, lage confidence). Dat is veilig (geen
 * hallucinaties) maar oninformatief.
 *
 * Deze router dispatcht:
 *  - **STOCK** (EQUITY/REIT) → bestaande `scoreFactors` op fundamentals.
 *  - **ETF / BOND / COMMODITY** → ETF-engine op fund-metadata.
 *  - **CRYPTO / CASH / OTHER** → bestaande stock-engine met fallback
 *    (composite blijft 50 bij gebrek aan zinvolle pillars).
 *
 * BOND en COMMODITY krijgen voorlopig dezelfde ETF-laag omdat ze
 * doorgaans als ETF/fund worden gehouden door particuliere beleggers
 * (XEON, IB01, IGLN). Bij directe bond-holdings zou een aparte
 * yield/credit-engine nodig zijn — buiten scope voor deze iteratie.
 */

export interface RouteFactorInput {
  ticker: string;
  asOf?: string;
  assetClass: AssetClass;
  /** Stock-pad: fundamentals + price history. */
  stockInput?: Omit<FactorScoringInput, "ticker" | "asOf">;
  /** ETF-pad: fund-metadata. */
  etfMetadata?: EtfMetadata | null;
  /** ETF-pad: user-objective voor fit-pillar. */
  objective?: InvestmentObjective | null;
  /** Override `now` voor deterministische tests. */
  now?: Date;
}

/**
 * `null`-fallback wanneer er geen zinvolle input is geleverd voor het
 * gekozen pad — voorkomt verzonnen output. Caller moet dit netjes
 * afhandelen (Holding krijgt dan geen `factorScore`).
 */
export function scoreFactorsByAssetClass(
  input: RouteFactorInput,
  weights?: FactorWeights,
): FactorScore | null {
  if (isEtfLike(input.assetClass)) {
    return scoreEtfFactors(
      {
        ticker: input.ticker,
        asOf: input.asOf,
        metadata: input.etfMetadata ?? null,
        objective: input.objective ?? null,
        now: input.now,
      },
      weights,
    );
  }

  if (input.stockInput) {
    return scoreFactors(
      {
        ticker: input.ticker,
        asOf: input.asOf,
        ...input.stockInput,
      },
      weights ?? DEFAULT_FACTOR_WEIGHTS,
    );
  }

  return null;
}

function isEtfLike(assetClass: AssetClass): boolean {
  return (
    assetClass === "ETF" ||
    assetClass === "BOND" ||
    assetClass === "COMMODITY"
  );
}
