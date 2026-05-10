/**
 * Input-shape voor de Portfolio Health Score engine.
 *
 * Deze module is OPZETTELIJK type-only — geen Prisma, geen netwerk —
 * zodat de engine pure-functioneel blijft en eenvoudig te testen valt.
 * De `loader.ts` module hydrateert deze shape uit de DB.
 */

import type { ISODateString } from "@/types/common";

import type {
  CashBufferInput,
  DiversificationInput,
  DividendQualityInput,
  DrawdownInput,
  FundamentalQualityInput,
  GeographicInput,
  MacroSensitivityInput,
  SectorConcentrationInput,
  ValuationRiskInput,
  VolatilityInput,
} from "./scorers";

export interface PortfolioHealthInput {
  portfolioId: string;
  asOf: ISODateString;
  diversification: DiversificationInput;
  sector: SectorConcentrationInput;
  geographic: GeographicInput;
  volatility: VolatilityInput;
  drawdown: DrawdownInput;
  cashBuffer: CashBufferInput;
  dividend: DividendQualityInput;
  fundamental: FundamentalQualityInput;
  valuation: ValuationRiskInput;
  macro: MacroSensitivityInput;
}
