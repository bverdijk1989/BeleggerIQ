/**
 * Input-shape voor de Signal Fusion Engine.
 *
 * Pure data — type-only. De `loader.ts` hydrateert dit uit de bestaande
 * engines (factor-engine, business-quality, macro-regime, risk-engine).
 *
 * Velden zijn allemaal optioneel: één doel = de extractor voor dat
 * signaal markeert het als `null` met een "geen data"-rationale. Dat
 * blijft pure-functie en testbaar zonder DB.
 */

import type { FactorScore, FundamentalsSnapshot } from "@/types/factor";
import type {
  AssetClassKey,
  MacroRegimeReport,
} from "../macro-regime";

export interface SignalInstrumentContext {
  ticker: string;
  name: string;
  sector: string | null;
  assetClass?: string | null;
  /** Factor-engine output — quality/value/momentum/lowVol als 0..100. */
  factorScore: FactorScore | null;
  /** Optioneel: ruwe fundamentals voor dividend + dieper inzicht. */
  fundamentals: FundamentalsSnapshot | null;
  /** AssetClassKey waaraan deze ticker gemapped wordt — voor macro-fit. */
  assetClassKey: AssetClassKey | null;
}

export interface SignalEarningsRevisions {
  /** Aantal opwaartse revisies de afgelopen 90d. */
  upgrades: number;
  /** Aantal neerwaartse revisies de afgelopen 90d. */
  downgrades: number;
  /** Datum van laatste meetpunt. */
  asOf: string;
  source: string;
}

export interface SignalSentiment {
  /** -1..+1; positief = bullish. */
  score: number;
  /** Volume / aantal berichten dat sentiment voedt. */
  sampleSize: number;
  asOf: string;
  source: string;
}

export interface SignalInsiderAnalyst {
  /** Net insider buying afgelopen 90d (>0 = netto kopen). */
  insiderNetBuyingScore: number | null;
  /** Gemiddeld analyst-rating, 1=strong sell, 5=strong buy. */
  averageAnalystRating: number | null;
  /** Aantal analysts in de gemiddelde. */
  analystCount: number | null;
  asOf: string;
  source: string;
}

export interface SignalPortfolioContext {
  /** Huidig gewicht van DEZE ticker in de portefeuille (fractie 0..1). */
  currentWeight: number;
  /** Sector-aandeel van het sector waar deze positie in valt. */
  sectorWeight: number;
  /** Total portfolio-positie-aantal. */
  positionCount: number;
  /** Concentratie HHI 0..1. */
  hhi: number;
}

export interface SignalFusionInput {
  instrument: SignalInstrumentContext;
  /** Earnings-revisie-data — null wanneer feed niet aangesloten. */
  earningsRevisions?: SignalEarningsRevisions | null;
  /** Sentiment-data — null wanneer feed niet aangesloten. */
  sentiment?: SignalSentiment | null;
  /** Insider/analyst — null wanneer feed niet aangesloten. */
  insiderAnalyst?: SignalInsiderAnalyst | null;
  /** Macro-regime report — om macro_sensitivity te bepalen. */
  macroRegime?: MacroRegimeReport | null;
  /** Portfolio-context — voor portfolio_fit. */
  portfolio?: SignalPortfolioContext | null;
  /** Override `now` voor deterministische tests. */
  asOf?: string;
}
