import type { ISODateString } from "@/types/common";
import type { MarketRegimeState } from "@/types/regime";

/**
 * Strategy Evidence types.
 *
 * Maakt backtest-uitkomsten **besluitvormend** i.p.v. alleen een CAGR-
 * getal. Elke deelanalyse (regime-breakdown, rolling 12m, DCA, regret,
 * drawdown-recovery, ...) is een pure functie die op dezelfde equity-
 * curve draait; de aggregator `buildEvidenceReport` bundelt ze tot één
 * report met een kernconclusie en expliciete beperkingen.
 *
 * Design-principes:
 *  - Reproduceerbaar: identieke equity-curve + benchmark → identiek
 *    report. Geen Date.now() tenzij expliciet via `config.now`.
 *  - Explainable: elke analyse levert genoeg velden om in de UI een
 *    NL-zin te kunnen maken (periode, bedragen, drempels).
 *  - AI-veilig: de "plain-language verdict" wordt gegenereerd uit
 *    getelde inputs (CAGR, regret-score, drawdown-recovery). Geen LLM
 *    calls in deze module.
 */

// ============================================================
//  Regime breakdown
// ============================================================

export interface RegimeBreakdownRow {
  regime: MarketRegimeState;
  monthsObserved: number;
  /** Total return van de strategie gedurende deze regime-fases. */
  strategyReturn: number;
  /** Annualised return. */
  strategyAnnualised: number;
  /** Total return van de benchmark in dezelfde maanden. */
  benchmarkReturn: number | null;
  benchmarkAnnualised: number | null;
  /** Excess = strategy - benchmark total return. */
  excessReturn: number | null;
}

// ============================================================
//  Rolling 12m returns
// ============================================================

export interface RollingWindowEntry {
  /** Einddatum van het window (laatste equity-point). */
  endDate: ISODateString;
  /** Startdatum van het window (eerste equity-point). */
  startDate: ISODateString;
  /** Total return van de strategie over dit window (fractie). */
  strategyReturn: number;
  /** Total return van de benchmark over hetzelfde window. */
  benchmarkReturn: number | null;
  /** Excess return (strategy - benchmark). Null als benchmark mist. */
  excessReturn: number | null;
}

export interface RollingWindowSummary {
  /** Windowbreedte in maanden (bv. 12). */
  windowMonths: number;
  /** Aantal windows dat berekend is. */
  count: number;
  entries: RollingWindowEntry[];
  /** Slechtste window qua strategy-return. */
  worst: RollingWindowEntry | null;
  /** Beste window qua strategy-return. */
  best: RollingWindowEntry | null;
  /** Aantal windows met negatief rendement. */
  negativeCount: number;
  /** Fractie windows met negatief rendement. */
  negativeShare: number;
}

// ============================================================
//  Underperformance-periodes
// ============================================================

export interface UnderperformancePeriod {
  startDate: ISODateString;
  endDate: ISODateString;
  months: number;
  /** Cumulatieve strategie-return tijdens de periode. */
  strategyReturn: number;
  /** Cumulatieve benchmark-return tijdens de periode. */
  benchmarkReturn: number;
  /** Excess return (negatief). */
  excessReturn: number;
}

// ============================================================
//  DCA simulation
// ============================================================

export interface DcaContributionSimulation {
  /** Eenmalige inleg. */
  initialCapital: number;
  /** Inleg per maand. */
  monthlyContribution: number;
  /** Aantal maanden gesimuleerd. */
  months: number;
  /** Som van alle inleg. */
  totalContributed: number;
  /** Eindwaarde van de DCA-lijn. */
  finalValue: number;
  /** Eindwaarde van dezelfde DCA op de benchmark. */
  benchmarkFinalValue: number | null;
  /** Money-weighted return (IRR-benadering) van de strategie. */
  moneyWeightedReturn: number;
  benchmarkMoneyWeightedReturn: number | null;
  /** `finalValue - totalContributed`. */
  profit: number;
  benchmarkProfit: number | null;
}

// ============================================================
//  Benchmark regret
// ============================================================

export interface BenchmarkRegretScore {
  /** 0..100 — hoe vaak + hoe veel strategy slechter deed. Hoger = meer regret. */
  score: number;
  /** Aantal maanden waarin strategie slechter was dan benchmark. */
  monthsUnderperforming: number;
  /** Aantal geobserveerde maanden met benchmark-paar. */
  monthsObserved: number;
  /** Fractie maanden waarin strategie achterliep. */
  underperformanceShare: number;
  /** Gemiddelde maandelijkse achterstand wanneer achter. */
  averageMonthlyShortfall: number;
  /** Grootste cumulatieve achterstand t.o.v. benchmark. */
  maxCumulativeShortfall: number;
}

// ============================================================
//  Drawdown recovery
// ============================================================

export interface DrawdownRecoveryEntry {
  /** Datum waarop de drawdown begon (laatste all-time-high ervoor). */
  peakDate: ISODateString;
  /** Datum van het dieptepunt binnen de drawdown. */
  troughDate: ISODateString;
  /** Datum waarop de equity-curve weer de oude piek evenaarde. `null` = nog niet hersteld. */
  recoveryDate: ISODateString | null;
  /** Diepste punt, fractie (negatief). */
  depth: number;
  /** Aantal maanden van peak tot trough. */
  monthsToTrough: number;
  /** Aantal maanden van peak tot recovery (null als niet hersteld). */
  monthsToRecovery: number | null;
}

export interface DrawdownRecoverySummary {
  entries: DrawdownRecoveryEntry[];
  /** Langste recovery-duur in maanden (uit recovered entries). */
  longestRecoveryMonths: number | null;
  /** Gemiddelde recovery-duur in maanden. */
  averageRecoveryMonths: number | null;
  /** True als er momenteel een nog-niet-herstelde drawdown is. */
  inProgress: boolean;
}

// ============================================================
//  Report + verdict
// ============================================================

export interface EvidenceVerdict {
  /** Gewone-taal conclusie (NL, 1-3 zinnen). */
  headline: string;
  /** Expliciete beperkingen (sample size, missende benchmark, etc.). */
  limitations: string[];
  /** Bullets die de kerncijfers samenvatten (NL). */
  highlights: string[];
  /** Hoe snel lezers zekerheid mogen hechten aan deze evidence (0..1). */
  confidence: number;
}

export interface StrategyEvidenceReport {
  generatedAt: ISODateString;
  strategyLabel: string;
  benchmarkLabel: string | null;
  /** Periode van de onderliggende backtest. */
  periodStart: ISODateString;
  periodEnd: ISODateString;
  /** Aantal maandelijkse equity-observaties. */
  monthsObserved: number;
  regimeBreakdown: RegimeBreakdownRow[];
  rollingTwelveMonth: RollingWindowSummary;
  worstTwelveMonth: RollingWindowEntry | null;
  bestTwelveMonth: RollingWindowEntry | null;
  underperformancePeriods: UnderperformancePeriod[];
  dcaSimulation: DcaContributionSimulation;
  benchmarkRegret: BenchmarkRegretScore | null;
  drawdownRecovery: DrawdownRecoverySummary;
  verdict: EvidenceVerdict;
}
