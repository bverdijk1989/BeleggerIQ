import type { Currency, ISODateString } from "@/types/common";
import type { InvestmentObjective } from "@/types/profile";

/**
 * ETF-metadata — input voor de ETF-factor-engine.
 *
 * Alle velden zijn **optioneel**. De engine moet gracieus afdalen
 * zodra een veld ontbreekt: dan zakt de bijbehorende sub-score niet
 * naar 0 maar naar `null` (sub-coverage = 0) en wordt de pillar-bijdrage
 * uit de composite-berekening weggelaten.
 *
 * **Geen fundamentals**. Een ETF is geen bedrijf — er bestaat geen
 * single-issuer ROIC, P/E of FCF-yield voor een fonds met 500
 * onderliggende namen. Hallucineren van fundamentals is exact wat we
 * met deze module willen voorkomen.
 */

export type DistributionPolicy = "ACCUMULATING" | "DISTRIBUTING";

export type ReplicationMethod =
  | "PHYSICAL_FULL"
  | "PHYSICAL_SAMPLED"
  | "SYNTHETIC"
  | "UNKNOWN";

export interface EtfMetadata {
  ticker: string;
  asOf: ISODateString;

  /** Total Expense Ratio als fractie (0.0007 = 0.07%). */
  ter?: number;
  /** Bid/ask-spread typisch in basispunten (10 bps = 0.10%). */
  spreadBps?: number;
  /** Assets Under Management in base currency. */
  aum?: number;
  /** Fondscurrency. */
  currency?: Currency;

  /** Inception-datum; gebruikt voor track-record-leeftijd. */
  inceptionDate?: ISODateString;

  /** Tracking-error t.o.v. de benchmark als fractie (0.0015 = 0.15%). */
  trackingErrorYearly?: number;

  distributionPolicy?: DistributionPolicy;
  replicationMethod?: ReplicationMethod;

  /** Gewicht in dominante regio (0..1) — voor fit-score. */
  topRegionWeight?: number;
  topRegion?: string;
  /** Gewicht in dominante sector (0..1). `null` voor breed gespreide ETFs. */
  topSectorWeight?: number;
  topSector?: string;

  /** Provider-warnings (bv. "AUM ontbreekt", "tracking-error niet beschikbaar"). */
  warnings?: string[];

  source?: string;
}

/**
 * Provider-adapter contract. De default implementatie retourneert
 * `null` (geen data); test- en productie-implementaties kunnen dit
 * aanvullen met FundProfile/FundPerformance-fetches uit Yahoo, JustETF,
 * Morningstar, etc.
 *
 * **Graceful fallback** is een kerncriterium: een gefaalde fetch mag
 * de scoring-pipeline niet breken. Caller hoort `null` netjes af te
 * handelen — engine bouwt dan een score met `coverage = 0` en
 * `confidence ≤ MAX_CONFIDENCE_LOW_COVERAGE`.
 */
export interface EtfMetadataProvider {
  getEtfMetadata(ticker: string): Promise<EtfMetadata | null>;
}

/**
 * No-op provider — default in productie zolang er geen FundProfile-
 * data-feed is aangesloten. Retourneert altijd `null` zodat ETFs een
 * neutrale-low-confidence score krijgen i.p.v. een gehallucineerde score.
 */
export const NULL_ETF_METADATA_PROVIDER: EtfMetadataProvider = {
  async getEtfMetadata() {
    return null;
  },
};

/**
 * Helper voor de fit-pillar: bepaalt of een distributie-policy past
 * bij de InvestmentObjective.
 *  - INCOME / RETIREMENT       → distributing-voorkeur (cashflow).
 *  - GROWTH / FIRE / CAPITAL_PRESERVATION / BALANCED → accumulating
 *    (fiscaal vaak gunstiger bij compound-effect; geen verplichte
 *    cashflow-uitkering).
 */
export function isDistributionPolicyAligned(
  policy: DistributionPolicy | undefined,
  objective: InvestmentObjective | null | undefined,
): boolean | null {
  if (policy === undefined) return null;
  if (!objective) return null;
  if (objective === "INCOME" || objective === "RETIREMENT") {
    return policy === "DISTRIBUTING";
  }
  return policy === "ACCUMULATING";
}
