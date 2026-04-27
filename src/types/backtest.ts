import type { Currency, ISODateString } from "./common";
import type { FactorWeights } from "./factor";
import type { RebalanceFrequency } from "./allocation";
import type { MarketRegimeState } from "./regime";

/**
 * Configuratie van een backtest-run. Deze is deterministisch:
 * dezelfde config op dezelfde data moet altijd hetzelfde resultaat geven.
 */
export interface BacktestConfig {
  id?: string;
  name: string;
  strategyPresetId?: string;

  startDate: ISODateString;
  endDate: ISODateString;

  initialCapital: number;
  baseCurrency: Currency;
  monthlyContribution?: number;

  rebalance: RebalanceFrequency;
  /** Max aantal gelijktijdige posities in de portefeuille. */
  maxPositions?: number;
  /** Cap op een enkele positie, fractie (0..1). */
  maxPositionWeight?: number;
  /** Cash buffer die niet belegd wordt, fractie (0..1). */
  cashBufferPct?: number;

  includeCosts: boolean;
  includeTaxes: boolean;
  /** Transactiekosten in basispunten per trade. */
  commissionBps?: number;
  /** Belastingdrag in basispunten per jaar. */
  taxDragBps?: number;

  benchmarkTicker?: string;
  /** Universe van toegestane tickers. */
  universe: string[];
  factorWeights?: FactorWeights;
}

/**
 * Eén punt op de equity curve van een backtest.
 */
export interface EquityPoint {
  date: ISODateString;
  value: number;
  benchmark?: number;
  drawdown?: number;
  regime?: MarketRegimeState;
}

/**
 * Regime-afhankelijk rendement, zodat de UI kan tonen hoe de strategie
 * zich in verschillende marktfases gedraagt.
 */
export interface RegimeBreakdown {
  regime: MarketRegimeState;
  /** Annualized return, fractie. */
  annualizedReturn: number;
  volatility: number;
  maxDrawdown: number;
  periodsDays: number;
}

/**
 * Resultaat van een backtest. Alle rendements- en volatilitymetrics
 * zijn fracties (0.08 = 8%), drawdown is negatief.
 */
export interface BacktestResult {
  config: BacktestConfig;
  equityCurve: EquityPoint[];

  totalReturn: number;
  cagr: number;
  volatility: number;
  sharpe: number;
  sortino?: number;
  maxDrawdown: number;
  calmar?: number;
  winRate?: number;
  /** Jaarlijkse turnover als fractie. */
  turnover?: number;
  tradesCount: number;
  finalValue: number;

  benchmark?: BenchmarkComparison;
  regimeBreakdown?: RegimeBreakdown[];
  /**
   * Methodologie-waarschuwingen die de gebruiker moet begrijpen vóór 'ie
   * de backtest-resultaten serieus neemt:
   *  - **survivorship**  — universe is statisch: alleen tickers die
   *    vandaag bestaan zitten in de historie; gefailde namen ontbreken.
   *  - **small-sample**  — minder dan 36 maanden: Sharpe/Sortino zijn
   *    statistisch zwak, max-drawdown is afhankelijk van toevallige fase.
   *  - **price-coverage** — meerdere maanden zonder prijsdata voor één of
   *    meer namen; engine heeft `lastKnownPrice` gebruikt (geen synthetic
   *    returns, maar resulteert wel in vlakke segmenten).
   *  - **look-ahead**    — strategy heeft toegang tot toekomstige prijzen
   *    die ze in productie niet zou hebben (audit-warning, niet
   *    automatisch detecteerbaar).
   */
  methodologyWarnings?: BacktestMethodologyWarning[];
}

export type BacktestMethodologyWarningKind =
  | "survivorship"
  | "small-sample"
  | "price-coverage"
  | "look-ahead";

export interface BacktestMethodologyWarning {
  kind: BacktestMethodologyWarningKind;
  message: string;
  /** 0..1 — hoe ernstig is dit risico voor de output? */
  severity: number;
}

/**
 * Vergelijking met een benchmark. Alpha/beta/trackingError worden
 * berekend op dezelfde sample als de backtest.
 */
export interface BenchmarkComparison {
  ticker: string;
  totalReturn: number;
  cagr: number;
  volatility: number;
  maxDrawdown: number;
  correlation?: number;
  alpha?: number;
  beta?: number;
  trackingError?: number;
  informationRatio?: number;
}

/**
 * Herbruikbaar strategie-preset. Wordt door Strategy Lab aangeboden als
 * startpunt en kan als `strategyPresetId` door BacktestConfig gerefereerd worden.
 */
export interface StrategyPreset {
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  factorWeights: FactorWeights;
  rebalance: RebalanceFrequency;
  maxPositions?: number;
  maxPositionWeight?: number;
  minMarketCap?: number;
  /** Ongetyped filter-blob, geldt als input voor de screener. */
  universeFilter?: Record<string, unknown>;
}
