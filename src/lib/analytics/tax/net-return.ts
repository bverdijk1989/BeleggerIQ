import { classifyInstrument } from "@/lib/analytics/instruments/classifier";
import type { Holding } from "@/types/portfolio";

import { BOX3_RATES_2025, computeBox3, type Box3Rates } from "./box3";
import {
  computeDividendTax,
  detectDomicile,
} from "./dividend-tax";
import type { NetReturnResult, TaxReport } from "./types";

/**
 * Net-return engine — combineert box 3 + dividend-tax tot één
 * indicatief netto-rendement.
 *
 * Formules:
 *   bruto-rendement (fractie)       = `grossReturnFraction`
 *   bruto-rendement (bedrag)        = `grossReturnFraction × portfolioValue`
 *   box 3-belasting                 = `computeBox3(...).taxOwed`
 *   dividend-tax (na verrekening)   = `dividendTax.foreignNonCreditable + dutchAlreadyHeld`
 *
 *   tax-impact (fractie)            = (box 3 + non-creditable WHT) / portfolioValue
 *   netto-rendement                 = bruto - tax-impact
 *
 * **Niet-verrekenbare** WHT (bv. impliciete fonds-lekkage IE/LU) is
 * altijd een verlies. Wel-verrekenbare WHT verlaagt box 3 maar wordt
 * door de gebruiker zelf via aangifte teruggevraagd; we modelleren
 * dat als netto-neutraal en tonen 'm in `amounts.foreignWht` voor
 * transparantie.
 */

export interface ComputeNetReturnInput {
  holdings: Holding[];
  /** Marktwaarde per holding in base currency (Map: ticker → waarde). */
  marketValueByTicker: Map<string, number>;
  /** Totale portefeuille-waarde EUR (default = som van marktwaardes). */
  portfolioValue?: number;
  /** Bruto rendement (fractie) over de meet-periode (typisch jaar). */
  grossReturnFraction: number;
  /** Geschat dividend-yield-tarief (fractie) per holding. Default 0.02 (2%). */
  estimatedDividendYield?: number;
  /** Domicilie-overrides per ticker (optioneel). */
  domicileOverrides?: Map<string, ReturnType<typeof detectDomicile>>;
  /** Box 3 input. */
  hasFiscalPartner?: boolean;
  exemptionOverride?: number;
  rates?: Box3Rates;
  /** Spaargeld in EUR (peildatum 1 jan, default 0). */
  cashWealth?: number;
  /** Schulden in EUR (peildatum 1 jan, default 0). */
  debtWealth?: number;
}

export function computeNetReturn(
  input: ComputeNetReturnInput,
): NetReturnResult {
  const portfolioValue =
    input.portfolioValue ??
    [...input.marketValueByTicker.values()].reduce((s, v) => s + v, 0);

  const dividendYield =
    input.estimatedDividendYield !== undefined &&
    Number.isFinite(input.estimatedDividendYield) &&
    input.estimatedDividendYield >= 0
      ? input.estimatedDividendYield
      : 0.02;

  // ----- Box 3 -----
  const box3 = computeBox3({
    investmentWealth: portfolioValue,
    cashWealth: input.cashWealth ?? 0,
    debtWealth: input.debtWealth ?? 0,
    hasFiscalPartner: input.hasFiscalPartner,
    exemptionOverride: input.exemptionOverride,
    rates: input.rates,
  });

  // ----- Dividend-tax: schat dividenden uit yield × marktwaarde -----
  const dividend = computeDividendTax({
    entries: input.holdings.map((h) => {
      const value = input.marketValueByTicker.get(h.ticker) ?? 0;
      return {
        ticker: h.ticker,
        name: h.name,
        grossDividend: value * dividendYield,
        domicileOverride: input.domicileOverrides?.get(h.ticker),
        holding: h,
      };
    }),
  });

  // ----- Tax-impact als fractie van portfolio -----
  // Niet-verrekenbare WHT (fonds-lekkage in IE/LU + niet-credit deel).
  const nonCreditable = dividend.foreignWithholdingTax + dividend.dutchDividendTax - dividend.creditableTax;
  const totalTaxAmount = box3.taxOwed + Math.max(0, nonCreditable);
  const taxImpactFraction =
    portfolioValue > 0 ? -totalTaxAmount / portfolioValue : 0;

  const grossReturnAmount = portfolioValue * input.grossReturnFraction;
  const netReturnFraction = input.grossReturnFraction + taxImpactFraction;
  const netReturnAmount = portfolioValue * netReturnFraction;

  const warnings = collectWarnings({
    holdings: input.holdings,
    portfolioValue,
    box3Tax: box3.taxOwed,
    dividend,
    grossReturnFraction: input.grossReturnFraction,
  });
  const confidence = computeConfidence({
    holdings: input.holdings,
    portfolioValue,
    grossReturnFraction: input.grossReturnFraction,
    dividendYieldProvided: input.estimatedDividendYield !== undefined,
  });

  return {
    grossReturn: input.grossReturnFraction,
    taxImpact: taxImpactFraction,
    netReturn: netReturnFraction,
    amounts: {
      grossReturnAmount,
      taxAmount: totalTaxAmount,
      netReturnAmount,
      box3Tax: box3.taxOwed,
      dividendTax: dividend.dutchDividendTax,
      foreignWht: dividend.foreignWithholdingTax,
    },
    box3,
    dividend,
    warnings,
    confidence,
  };
}

/**
 * Convenience-wrapper die direct een complete `TaxReport` bouwt.
 */
export function buildTaxReport(
  input: ComputeNetReturnInput & { taxYear?: number },
): TaxReport {
  const result = computeNetReturn(input);
  return {
    generatedAt: new Date().toISOString(),
    baseCurrency: "EUR",
    taxYear: input.taxYear ?? input.rates?.taxYear ?? BOX3_RATES_2025.taxYear,
    result,
  };
}

// ============================================================
//  Warnings + confidence (pure)
// ============================================================

interface WarningInput {
  holdings: Holding[];
  portfolioValue: number;
  box3Tax: number;
  dividend: ReturnType<typeof computeDividendTax>;
  grossReturnFraction: number;
}

function collectWarnings(input: WarningInput): string[] {
  const warnings: string[] = [];

  // 1. Inefficiënte ETF-structuur — IE/LU UCITS-fondsen kennen
  //    interne dividend-lekkage. Detecteer via classifier of via
  //    domicilie van een ETF holding.
  for (const h of input.holdings) {
    const classification = classifyInstrument({ holding: h, enrichment: null });
    const isFund =
      classification.instrumentType === "BROAD_MARKET_ETF" ||
      classification.instrumentType === "INCOME_ETF" ||
      classification.instrumentType === "BOND_ETF" ||
      classification.instrumentType === "COMMODITY_ETF";
    if (!isFund) continue;
    const dom = detectDomicile(h);
    if (dom === "IE" || dom === "LU") {
      warnings.push(
        `${h.ticker}: ${dom}-domicile UCITS — interne WHT-lekkage (~10%) op US-aandelen, niet verrekenbaar.`,
      );
    } else if (dom === "US") {
      warnings.push(
        `${h.ticker}: US-domicile ETF — voor NL-belegger fiscaal minder efficiënt dan een IE-equivalent (PFIC-risico's daargelaten).`,
      );
    }
  }

  // 2. Box 3-druk hoog t.o.v. verwacht rendement?
  if (
    input.portfolioValue > 0 &&
    input.box3Tax > input.portfolioValue * input.grossReturnFraction
  ) {
    warnings.push(
      "Box 3-belasting overschrijdt het verwachte bruto rendement — netto rendement is negatief.",
    );
  }

  // 3. Niet-verrekenbare WHT.
  const nonCreditable =
    input.dividend.foreignWithholdingTax +
    input.dividend.dutchDividendTax -
    input.dividend.creditableTax;
  if (nonCreditable > 0) {
    warnings.push(
      `Niet-verrekenbare WHT geschat op ${formatEur(nonCreditable)} (fonds-lekkage of buitenlandse heffing boven 15%).`,
    );
  }

  // 4. Crypto / speculatief — fiscaal onzeker.
  for (const h of input.holdings) {
    if (h.assetClass === "CRYPTO") {
      warnings.push(
        `${h.ticker}: crypto valt onder box 3 maar fiscale behandeling kan wijzigen — controleer de meest recente belastingdienst-richtlijn.`,
      );
    }
  }

  return warnings;
}

interface ConfidenceInput {
  holdings: Holding[];
  portfolioValue: number;
  grossReturnFraction: number;
  dividendYieldProvided: boolean;
}

function computeConfidence(input: ConfidenceInput): number {
  let confidence = 0.5;
  if (input.holdings.length > 0) confidence += 0.1;
  if (input.portfolioValue > 0) confidence += 0.1;
  if (Number.isFinite(input.grossReturnFraction)) confidence += 0.1;
  if (input.dividendYieldProvided) confidence += 0.1;
  if (input.holdings.every((h) => h.isin)) confidence += 0.1;
  return Math.min(1, Number(confidence.toFixed(2)));
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
