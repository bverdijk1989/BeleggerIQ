import type {
  EtfMetadata,
  EtfMetadataProvider,
} from "@/lib/analytics/etf-factors";

/**
 * Provider-adapter voor ETF-metadata.
 *
 * Productie-implementatie volgt zodra een data-source is aangesloten
 * (Yahoo `fundProfile`, JustETF, Morningstar Direct, Trackinsight).
 * Tot dan retourneert `getEtfMetadata` `null` — caller hoort dat netjes
 * af te handelen, en de scoring-engine zakt automatisch terug op een
 * neutrale composite met `confidence ≤ MAX_CONFIDENCE_LOW_COVERAGE`.
 *
 * **Geen verzonnen data**. Wanneer een veld niet beschikbaar is laten
 * we het `undefined`. Hallucinatie zou de hele bestaansreden van de
 * ETF-factor-laag ondermijnen.
 */

/**
 * Default no-op provider voor productie tot een data-feed is gewired.
 */
export const defaultEtfMetadataProvider: EtfMetadataProvider = {
  async getEtfMetadata(): Promise<EtfMetadata | null> {
    return null;
  },
};

export async function getEtfMetadata(
  ticker: string,
): Promise<EtfMetadata | null> {
  return defaultEtfMetadataProvider.getEtfMetadata(ticker);
}
