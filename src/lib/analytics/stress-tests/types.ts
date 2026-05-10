/**
 * Stress-tests module — types.
 *
 * Tien scenarios (9 vooraf-gedefinieerde + 1 custom) met expliciete
 * aannames en heuristische sector-shocks. Geen economisch model — een
 * scenario-mapping. Buffett-laag: focus op downside-protection; Dalio-
 * laag: scenario-denken centraal; Simons-laag: aannames expliciet
 * gedocumenteerd.
 *
 * **Disclaimer**: dit is **indicatief**. Real-world shocks bewegen niet
 * lineair, sector-correlaties wijzigen, en sequence-of-returns telt.
 * UI toont een uncertainty-banner.
 */

import type { ISODateString } from "@/types/common";
import type { SectorBucket } from "../macro/regime";

export type StressScenarioId =
  | "RATES_UP_SHARP"
  | "RECESSION"
  | "STAGFLATION"
  | "TECH_SELLOFF"
  | "ENERGY_CRISIS"
  | "USD_EUR_SHOCK"
  | "MARKET_CRASH_20"
  | "SECTOR_ROTATION"
  | "LIQUIDITY_CRISIS"
  | "CUSTOM";

export type StressSeverity = "moderate" | "severe" | "extreme";

/**
 * Eén scenario-definitie. Wordt deterministisch gemapt naar een
 * `StressTestResult` per portefeuille.
 */
export interface StressScenarioDefinition {
  id: StressScenarioId;
  label: string;
  /** 1-zin spreektaal-uitleg. Lynch-laag. */
  description: string;
  /** Aannames als bullet-list. Simons-laag — expliciet, niet weggemoffeld. */
  assumptions: string[];
  /** Inschatting van waarschijnlijkheid op 24-mnd-horizon (subjectief). */
  baselineProbability: "low" | "medium" | "high";
  severity: StressSeverity;
  /** Per-sector portefeuille-impact, fractie. -0.20 = sector valt 20% terug. */
  sectorShocks: Record<SectorBucket, number>;
  /** Currency-shock voor niet-base-currency posities, fractie. */
  currencyShock: number;
  /** Bond-shock fractie (negatief = obligaties dalen). */
  bondShock: number;
  /** Cash-shock fractie (vrijwel altijd 0; bij liquidity-crisis kan inflatie cash-koopkracht eten). */
  cashShock: number;
  /** Welke macro-regimes dit scenario typisch begeleidt. */
  typicalRegimes: string[];
}

/** Per-positie impact in dit scenario. */
export interface StressPositionImpact {
  ticker: string;
  name: string;
  sector: string | null;
  /** Huidige weight 0..1. */
  weight: number;
  /** Toegepaste shock (fractie). */
  shock: number;
  /** Bijdrage aan totaal = weight × shock. */
  contribution: number;
  /** Marktwaarde voor in base-currency. */
  marketValueBase: number;
}

/** Resultaat per scenario. */
export interface StressTestResult {
  scenario: StressScenarioId;
  label: string;
  description: string;
  severity: StressSeverity;
  /** Totale relatieve P&L over de portefeuille. */
  portfolioImpactPct: number;
  /** In base-currency (negatief = verlies). */
  portfolioImpactAmount: number;
  /** Top-3 negatieve bijdragen. */
  biggestLosers: StressPositionImpact[];
  /** Top-3 zwakker geraakte (of zelfs positief). */
  biggestWinners: StressPositionImpact[];
  /** 0..100, hoger = portefeuille beter beschermd in dit scenario. */
  defensiveStrength: number;
  /** NL-zin — kernconclusie voor deze test. */
  verdict: string;
  /** Lijst data-quality / aannames-issues. */
  warnings: string[];
  /** Aannames van het gekozen scenario — voor disclaimer. */
  assumptions: string[];
}

/** Volledig stress-test report (alle scenarios + meta). */
export interface StressTestReport {
  generatedAt: ISODateString;
  baseCurrency: string;
  totalValue: number;
  /** Alle scenarios in canonical volgorde. */
  results: StressTestResult[];
  /** Worst-case scenario op portfolio-impact. */
  worst: StressTestResult | null;
  /** Best-case scenario (kleinste verlies of grootste winst). */
  best: StressTestResult | null;
  /** Universele disclaimer-string. */
  disclaimer: string;
}

/** Custom scenario-input voor de gebruiker-eigen test. */
export interface CustomStressScenarioInput {
  label: string;
  description: string;
  assumptions: string[];
  /** Per-sector shock 0..1 (in fractie, negatief = daling). */
  sectorShocks?: Partial<Record<SectorBucket, number>>;
  /** Default-shock voor sectors die niet in `sectorShocks` staan. */
  defaultShock: number;
  currencyShock: number;
  bondShock: number;
  cashShock: number;
  severity: StressSeverity;
}

export const STRESS_SCENARIO_ORDER: ReadonlyArray<StressScenarioId> = [
  "RATES_UP_SHARP",
  "RECESSION",
  "STAGFLATION",
  "TECH_SELLOFF",
  "ENERGY_CRISIS",
  "USD_EUR_SHOCK",
  "MARKET_CRASH_20",
  "SECTOR_ROTATION",
  "LIQUIDITY_CRISIS",
];

export const STRESS_DISCLAIMER =
  "Stress-tests zijn indicatief. Echte schokken bewegen niet lineair, sector-correlaties wijzigen onder druk, en sequence-of-returns telt. Gebruik deze cijfers om voorbereid te zijn op verschillende uitkomsten — niet als voorspelling.";
