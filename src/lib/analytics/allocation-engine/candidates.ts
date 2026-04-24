import type { Currency } from "@/types/common";
import type { FactorScore } from "@/types/factor";
import type { PolicySettings } from "@/types/profile";

import type { HoldingValuation } from "../valuation";

import type { ObjectiveTilt } from "./context";
import type { AllocationThresholds } from "./thresholds";

/**
 * Candidate-module voor de monthly buy engine. Selecteert bestaande
 * holdings die kwalificeren voor bijkoop en voegt optioneel een core-ETF
 * toe als fallback voor spreiding.
 */

export interface CoreEtfConfig {
  ticker: string;
  name: string;
  sector: string;
  region: string;
  currency: Currency;
}

export const DEFAULT_CORE_ETF: CoreEtfConfig = {
  ticker: "IWDA",
  name: "iShares Core MSCI World UCITS ETF",
  sector: "Diversified",
  region: "Global",
  currency: "EUR",
};

export interface BuyCandidate {
  ticker: string;
  name: string;
  currency: Currency;
  sector: string | null;
  region: string | null;
  currentWeight: number;
  /** Maximaal gewicht dat mag worden bijgekocht zonder cap te overschrijden. */
  headroomWeight: number;
  unitPriceBase?: number;
  factorScore: FactorScore | null;
  /** Of de candidate al in de portefeuille zit. */
  isExisting: boolean;
  /** Of dit de core-ETF fallback is. */
  isCoreEtf: boolean;
  /** Waarom een candidate uit de lijst is gefilterd (debug/UI). */
  excludedReason?: string;
}

export interface DetermineBuyCandidatesInput {
  valuations: HoldingValuation[];
  totalValue: number;
  thresholds: AllocationThresholds;
  policy?: PolicySettings | null;
  objectiveTilt: ObjectiveTilt;
  coreEtf?: CoreEtfConfig | null;
  /** Huidige sector-exposure (weight per sector). Gebruikt voor sector-cap. */
  sectorWeights?: Map<string, number>;
}

/**
 * Filter bestaande holdings die in aanmerking komen en voeg eventueel
 * een core-ETF toe. Retourneert ALTIJD een lijst (evt. leeg) plus een
 * parallelle lijst `excluded` voor UI/explain.
 */
export function determineBuyCandidates(
  input: DetermineBuyCandidatesInput,
): { candidates: BuyCandidate[]; excluded: BuyCandidate[] } {
  const candidates: BuyCandidate[] = [];
  const excluded: BuyCandidate[] = [];

  const excludedTickers = new Set(
    input.policy?.excludedTickers?.map((t) => t.toUpperCase()) ?? [],
  );
  const allowedAssetClasses = input.policy?.allowedAssetClasses;

  for (const valuation of input.valuations) {
    const holding = valuation.holding;
    const ticker = holding.ticker.toUpperCase();
    const weight =
      input.totalValue > 0 ? valuation.marketValueBase / input.totalValue : 0;
    const headroom = Math.max(0, input.thresholds.maxPositionWeight - weight);
    const unitPriceBase =
      holding.quantity > 0
        ? valuation.marketValueBase / holding.quantity
        : undefined;

    const base: BuyCandidate = {
      ticker,
      name: holding.name,
      currency: holding.currency,
      sector: holding.sector ?? null,
      region: holding.region ?? null,
      currentWeight: weight,
      headroomWeight: headroom,
      unitPriceBase,
      factorScore: holding.factorScore ?? null,
      isExisting: true,
      isCoreEtf: false,
    };

    if (excludedTickers.has(ticker)) {
      excluded.push({ ...base, excludedReason: "Excluded via policy" });
      continue;
    }

    if (
      allowedAssetClasses &&
      allowedAssetClasses.length > 0 &&
      !allowedAssetClasses.includes(holding.assetClass)
    ) {
      excluded.push({
        ...base,
        excludedReason: `Asset class ${holding.assetClass} niet toegestaan in policy`,
      });
      continue;
    }

    if (headroom <= 0.001) {
      excluded.push({
        ...base,
        excludedReason: "Positie zit al op of boven de cap",
      });
      continue;
    }

    if (
      input.thresholds.minCandidateComposite > 0 &&
      (holding.factorScore?.composite ?? 50) <
        input.thresholds.minCandidateComposite
    ) {
      excluded.push({
        ...base,
        excludedReason: "Composite score onder minimum",
      });
      continue;
    }

    if (
      input.objectiveTilt.requireDividend &&
      !hasDividendSignal(holding.factorScore ?? null)
    ) {
      excluded.push({
        ...base,
        excludedReason: "Geen dividend-signaal voor inkomensprofiel",
      });
      continue;
    }

    const sectorWeight = input.sectorWeights?.get(holding.sector ?? "") ?? 0;
    if (
      holding.sector &&
      sectorWeight >= input.thresholds.maxSectorWeight &&
      headroom < 0.02
    ) {
      excluded.push({
        ...base,
        excludedReason: `Sector ${holding.sector} boven cap`,
      });
      continue;
    }

    candidates.push(base);
  }

  // Core-ETF fallback: voeg toe als
  //  - totale portefeuille < coreEtfMinPositions (dunne spreiding), of
  //  - álle bestaande candidates staan op/voor de cap (geen headroom), of
  //  - er überhaupt geen candidates zijn gevonden.
  const core = input.coreEtf;
  const hasEnoughPositions =
    input.valuations.length >= input.thresholds.coreEtfMinPositions;
  const allNearCap =
    candidates.length > 0 &&
    candidates.every((c) => c.headroomWeight < 0.02);
  const coreExcluded =
    core === undefined ||
    core === null ||
    excludedTickers.has(core.ticker.toUpperCase());
  const shouldAddCore =
    !coreExcluded &&
    (!hasEnoughPositions || allNearCap || candidates.length === 0);
  if (shouldAddCore && core) {
    const existing = input.valuations.find(
      (v) => v.holding.ticker.toUpperCase() === core.ticker.toUpperCase(),
    );
    const weight =
      existing && input.totalValue > 0
        ? existing.marketValueBase / input.totalValue
        : 0;
    const headroom = Math.max(0, input.thresholds.maxPositionWeight - weight);

    // Alleen toevoegen als er echt nog ruimte is.
    if (headroom > 0.001) {
      candidates.push({
        ticker: core.ticker.toUpperCase(),
        name: core.name,
        currency: core.currency,
        sector: core.sector,
        region: core.region,
        currentWeight: weight,
        headroomWeight: headroom,
        unitPriceBase: existing
          ? existing.marketValueBase / Math.max(1, existing.holding.quantity)
          : undefined,
        factorScore: existing?.holding.factorScore ?? null,
        isExisting: Boolean(existing),
        isCoreEtf: true,
      });
    }
  }

  return { candidates, excluded };
}

/**
 * Dividend-signaal ruim gedefinieerd: of de value-rationale noemt
 * dividend, of de FundamentalsSnapshot had een positieve dividendYield.
 * Omdat we hier geen fundamentals meer hebben, leunen we op factorScore.
 */
function hasDividendSignal(score: FactorScore | null): boolean {
  if (!score) return false;
  if ((score.subScores.dividend ?? 0) >= 55) return true;
  const valueRationale = score.rationales?.value ?? [];
  return valueRationale.some((r) => /dividend/i.test(r));
}
