import type { ISODateString } from "@/types/common";
import type { InstrumentType } from "@/lib/analytics/instruments";

/**
 * Policy-engine types.
 *
 * Deze module vertaalt `InstrumentType` + portefeuille-context naar
 * concrete caps en violation-severities. Design-principes:
 *
 *  - **Deterministisch**: gelijke input → gelijk resultaat. Geen willekeur,
 *    geen AI — alles is een tabel of een pure regel.
 *  - **Override-vriendelijk**: elke cap kan per user-policy worden
 *    overruled. Defaults zijn conservatief; users met een defensief profiel
 *    willen vaak strenger.
 *  - **Engine-klaar**: de output (`PolicyViolation`) bevat alle velden die
 *    risk- en rebalance-engine nodig hebben om priorities te stellen.
 */

export type InstrumentRiskLevel = "LOW" | "MODERATE" | "ELEVATED" | "HIGH";

export type ViolationSeverity = "ok" | "minor" | "major" | "critical";

export interface PositionLimit {
  /** Cap voor de positie in deze holding, fractie 0..1. */
  allowedMaxWeight: number;
  /** Welke bron heeft deze cap bepaald (default / user policy / override). */
  basis: "default" | "user-policy" | "user-override" | "risk-adjusted";
  /** Uitlegbare reden ("Single stock — conservatieve cap van 10%"). */
  reason: string;
}

export interface PolicyViolation {
  holdingId: string;
  ticker: string;
  instrumentType: InstrumentType;
  currentWeight: number;
  allowedMaxWeight: number;
  /** `currentWeight - allowedMaxWeight`. `0` als binnen de cap. */
  excessWeight: number;
  violationSeverity: ViolationSeverity;
  policyReason: string;
  riskLevel: InstrumentRiskLevel;
  /** Overige policy-regels die zijn getest (bv. sector/regio). */
  notes: string[];
}

export interface PolicyReport {
  /** Totale portefeuille-waarde die is gebruikt voor weight-berekening. */
  totalValue: number;
  assessedAt: ISODateString;
  violations: PolicyViolation[];
  /** Aantallen per severity, handig voor dashboard-badges. */
  counts: Record<ViolationSeverity, number>;
  /** Overall portefeuille-severity: slechtste positie-severity. */
  overallSeverity: ViolationSeverity;
}

/**
 * Per-instrumentType caps. `null` = geen cap (bv. cash).
 *
 * Waardes bewust conservatief maar niet dogmatisch. Ze komen voort uit
 * algemene langetermijn-principes:
 *  - Broad-market ETF (IWDA/VWCE/VUSA): 40% is een normale "ruggengraat"
 *    voor een all-equity portefeuille — je wil dat deze positie groot mag.
 *  - Sector ETFs: 15% — één sector-bet mag niet domineren.
 *  - Theme ETFs: 10% — smallere mandjes + narratief-risico.
 *  - Single stock: 10% — Kelly-grenswaarde voor diversificatie bij
 *    20+ posities. High-vol/speculatieve stocks krijgen risk-adjusted 5%.
 *  - Covered-call ETFs (INCOME_ETF): 25% — income-focus met capped upside.
 *  - Bond ETF: 50% — pensioen-achtige profielen leunen hier zwaar op.
 *  - Crypto: 5% — volatility-budget.
 *  - Leveraged/inverse: 3% — compounding-drift, niet laten doorlopen.
 *  - Unknown: 5% — voorzichtig zijn als we het niet kunnen evalueren.
 */
export const DEFAULT_LIMITS_BY_TYPE: Record<InstrumentType, number | null> = {
  SINGLE_STOCK: 0.10,
  BROAD_MARKET_ETF: 0.40,
  FACTOR_ETF: 0.30,
  SECTOR_ETF: 0.15,
  THEME_ETF: 0.10,
  INCOME_ETF: 0.25,
  BOND_ETF: 0.50,
  COMMODITY_ETF: 0.15,
  CRYPTO: 0.05,
  CASH: null,
  LEVERAGED_OR_INVERSE: 0.03,
  UNKNOWN_ETF: 0.10,
  UNKNOWN: 0.05,
};

/**
 * Risk-adjusted reductie. Wanneer een positie als HIGH risk classifeert
 * (speculatief of high-volatility) halveren we de cap. ELEVATED → 0.75×.
 * LOW/MODERATE hebben geen reductie.
 *
 * Deze multipliers zijn consistent toepasbaar zonder per-type special
 * cases — dus transparant voor de UI die de reason-tekst toont.
 */
export const RISK_ADJUSTMENT_MULTIPLIER: Record<InstrumentRiskLevel, number> = {
  LOW: 1,
  MODERATE: 1,
  ELEVATED: 0.75,
  HIGH: 0.5,
};

export interface InstrumentPolicyOverrides {
  /** Per-type override op `DEFAULT_LIMITS_BY_TYPE`. `null` wist cap. */
  limitsByType?: Partial<Record<InstrumentType, number | null>>;
  /** Optionele globale multiplier op alle caps (bv. 0.8 voor CAPITAL_PRESERVATION). */
  globalTightening?: number;
}

export interface PolicyContext {
  /** Per-type overrides bovenop defaults. */
  overrides?: InstrumentPolicyOverrides;
  /** `PolicySettings.maxPositionWeight` uit user profile. Als gezet: hard
   *  cap op SINGLE_STOCK (mag lager zijn dan default, niet hoger). */
  userMaxSinglePositionWeight?: number | null;
}
