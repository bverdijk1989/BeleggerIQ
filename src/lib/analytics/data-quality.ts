import type { EnrichedInstrument } from "@/lib/data/instrument-enrichment";
import type { Holding } from "@/types/portfolio";

/**
 * Data-quality analytics.
 *
 * Puur. Geen I/O, geen mutaties. Neemt een lijst holdings + (optioneel)
 * hun enrichment-resultaten en produceert een rapport per holding en op
 * portfolio-niveau. Geeft de UI precies genoeg context om te zien waar
 * data ontbreekt en hoe erg dat is.
 *
 * Design:
 *  - Severity is **weight-gewogen** op portfolio-niveau: een onbekende
 *    sector op een 0,3%-positie is minder erg dan op een 25%-positie.
 *  - Missing fields lijst is stabiel — UI kan er i18n-keys van maken.
 *  - Geen verzonnen scores: als er geen enrichment-record is,
 *    retourneren we `confidence = 0` en markeren we alle smart-velden
 *    als `missing`.
 */

export type DataQualitySeverity = "ok" | "minor" | "major";

export type MissingField =
  | "ticker"
  | "isin"
  | "name"
  | "assetClass"
  | "sector"
  | "industry"
  | "region"
  | "currency"
  | "exchange";

export interface HoldingQuality {
  ticker: string;
  holdingId: string;
  /** Kanoniek Yahoo-symbool uit enrichment. `null` wanneer enrichment
   *  gelijk is aan de input-ticker of ontbreekt. Gebruikt door de UI om
   *  mismatches (bv. `VANGUARD` → `VOO` i.p.v. `VUSA.AS`) zichtbaar te
   *  maken zodat de user een override kan overwegen. */
  normalizedTicker: string | null;
  /** 0..1: provider-confidence uit enrichment, of 0 als er geen record is. */
  confidence: number;
  /** 0..1: fractie relevante velden die gevuld zijn (zie `missing`). */
  completeness: number;
  missing: MissingField[];
  /** ok ≥ 0.85, minor ≥ 0.5, major < 0.5 (completeness). */
  severity: DataQualitySeverity;
  /** Weight in portfolio (0..1). Gebruikt voor portfolio-roll-up. */
  weight: number;
  /** Provider warnings + afgeleide notes. */
  notes: string[];
  /** Asset class uit enrichment (of uit Holding-fallback). */
  assetClass: Holding["assetClass"] | null;
}

export interface PortfolioQualityReport {
  /** 0..1: weight-gewogen gemiddelde completeness over alle holdings. */
  overallScore: number;
  holdingCount: number;
  fullyEnriched: number; // completeness ≥ 0.85
  partiallyEnriched: number; // ≥ 0.5
  poorlyEnriched: number; // < 0.5
  /** Fractie portefeuille (weight-weighted) zonder sector-data. */
  unknownSectorWeight: number;
  unknownRegionWeight: number;
  unknownAssetClassWeight: number;
  holdings: HoldingQuality[];
  /** Bron-verdeling over enrichment-records (aantal holdings per bron). */
  distributionBySource: Record<string, number>;
  assessedAt: string;
}

const MAJOR_THRESHOLD = 0.5;
const OK_THRESHOLD = 0.85;

/**
 * De velden die we voor een "volledig verrijkt" instrument willen hebben.
 * Voor ETFs zijn sector/industry verwacht leeg — we accepteren dat en
 * tellen ze niet als "missing" in de completeness-berekening.
 */
const REQUIRED_FIELDS_EQUITY: MissingField[] = [
  "ticker",
  "isin",
  "name",
  "assetClass",
  "sector",
  "industry",
  "region",
  "currency",
  "exchange",
];

const REQUIRED_FIELDS_FUND: MissingField[] = [
  "ticker",
  "isin",
  "name",
  "assetClass",
  "region",
  "currency",
  "exchange",
];

function requiredFieldsFor(
  assetClass: Holding["assetClass"] | null,
): MissingField[] {
  if (assetClass === "ETF" || assetClass === "OTHER") return REQUIRED_FIELDS_FUND;
  return REQUIRED_FIELDS_EQUITY;
}

export interface AssessHoldingQualityInput {
  holding: Pick<
    Holding,
    "id" | "ticker" | "isin" | "name" | "sector" | "region" | "currency" | "assetClass"
  >;
  enrichment?: EnrichedInstrument | null;
  /** Weight 0..1 binnen het portfolio. */
  weight: number;
}

export function assessHoldingQuality(
  input: AssessHoldingQualityInput,
): HoldingQuality {
  const { holding, enrichment, weight } = input;

  const assetClass = enrichment?.assetClass ?? holding.assetClass ?? null;
  const required = requiredFieldsFor(assetClass);

  const resolved = {
    ticker: holding.ticker,
    isin: enrichment?.isin ?? holding.isin ?? null,
    name: enrichment?.name ?? holding.name ?? null,
    assetClass: assetClass,
    sector: enrichment?.sector ?? holding.sector ?? null,
    industry: enrichment?.industry ?? null,
    region:
      enrichment && enrichment.region !== "Unknown"
        ? enrichment.region
        : (holding.region ?? null),
    currency: enrichment?.currency ?? holding.currency ?? null,
    exchange: enrichment?.exchange ?? null,
  };

  const missing: MissingField[] = [];
  for (const field of required) {
    const value = resolved[field];
    if (value === null || value === undefined || value === "") {
      missing.push(field);
    }
  }

  const completeness =
    required.length === 0
      ? 1
      : Math.round((1 - missing.length / required.length) * 100) / 100;

  const severity: DataQualitySeverity =
    completeness >= OK_THRESHOLD
      ? "ok"
      : completeness >= MAJOR_THRESHOLD
        ? "minor"
        : "major";

  const notes: string[] = [];
  if (enrichment?.warnings) notes.push(...enrichment.warnings);
  if (!enrichment) notes.push("Geen enrichment-record — alleen import-data.");
  if (missing.includes("sector") && assetClass === "EQUITY") {
    notes.push("Sector onbekend — sector-exposure en factor-attribution incompleet.");
  }
  if (missing.includes("region")) {
    notes.push("Regio onbekend — valt terug op valuta voor geografische toewijzing.");
  }

  // Toon het resolved symbol in de UI alleen wanneer het afwijkt van de
  // input-ticker — een 1-op-1 match (bv. "MSFT" → "MSFT") voegt niets toe.
  const normalizedTicker =
    enrichment &&
    enrichment.normalizedTicker &&
    enrichment.normalizedTicker !== holding.ticker
      ? enrichment.normalizedTicker
      : null;

  return {
    ticker: holding.ticker,
    holdingId: holding.id,
    normalizedTicker,
    confidence: enrichment?.confidence ?? 0,
    completeness,
    missing,
    severity,
    weight: Number.isFinite(weight) ? Math.max(0, Math.min(1, weight)) : 0,
    notes,
    assetClass,
  };
}

export interface AssessPortfolioQualityInput {
  holdings: Array<AssessHoldingQualityInput>;
}

export function assessPortfolioQuality(
  input: AssessPortfolioQualityInput,
): PortfolioQualityReport {
  const assessedAt = new Date().toISOString();
  const perHolding = input.holdings.map(assessHoldingQuality);

  const totalWeight = perHolding.reduce((sum, h) => sum + h.weight, 0);
  const weightedCompleteness =
    totalWeight > 0
      ? perHolding.reduce((sum, h) => sum + h.completeness * h.weight, 0) /
        totalWeight
      : 0;

  const unknownSectorWeight = perHolding
    .filter((h) => h.assetClass === "EQUITY" && h.missing.includes("sector"))
    .reduce((sum, h) => sum + h.weight, 0);

  const unknownRegionWeight = perHolding
    .filter((h) => h.missing.includes("region"))
    .reduce((sum, h) => sum + h.weight, 0);

  const unknownAssetClassWeight = perHolding
    .filter((h) => h.assetClass === null || h.assetClass === "OTHER")
    .reduce((sum, h) => sum + h.weight, 0);

  const distributionBySource: Record<string, number> = {};
  for (const input_ of input.holdings) {
    const sources = input_.enrichment?.sources ?? ["input"];
    for (const src of sources) {
      distributionBySource[src] = (distributionBySource[src] ?? 0) + 1;
    }
  }

  return {
    overallScore: Math.round(weightedCompleteness * 100) / 100,
    holdingCount: perHolding.length,
    fullyEnriched: perHolding.filter((h) => h.severity === "ok").length,
    partiallyEnriched: perHolding.filter((h) => h.severity === "minor").length,
    poorlyEnriched: perHolding.filter((h) => h.severity === "major").length,
    unknownSectorWeight: round2(unknownSectorWeight),
    unknownRegionWeight: round2(unknownRegionWeight),
    unknownAssetClassWeight: round2(unknownAssetClassWeight),
    holdings: perHolding,
    distributionBySource,
    assessedAt,
  };
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

// ============================================================
//  UI-helpers (pure presentatielogica, blijft buiten componenten)
// ============================================================

export const SEVERITY_LABELS: Record<DataQualitySeverity, string> = {
  ok: "Volledig",
  minor: "Deels",
  major: "Onvolledig",
};

export const MISSING_FIELD_LABELS: Record<MissingField, string> = {
  ticker: "Ticker",
  isin: "ISIN",
  name: "Naam",
  assetClass: "Asset class",
  sector: "Sector",
  industry: "Industrie",
  region: "Regio",
  currency: "Valuta",
  exchange: "Beurs",
};

/**
 * Geef een mensleesbaar oordeel over de portefeuille-brede score.
 * Bewust conservatief: onder 0.75 is het niet "goed".
 */
export function portfolioQualityVerdict(score: number): {
  label: "Goed" | "Acceptabel" | "Zwak";
  tone: "positive" | "neutral" | "warning";
} {
  if (score >= 0.85) return { label: "Goed", tone: "positive" };
  if (score >= 0.65) return { label: "Acceptabel", tone: "neutral" };
  return { label: "Zwak", tone: "warning" };
}
