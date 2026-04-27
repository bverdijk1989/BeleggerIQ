import type { Box3Calculation } from "./types";

/**
 * Box 3 (vermogensrendementsheffing) — indicatief model voor 2025.
 *
 * **Pure functie**, geen juridisch advies. Gebruikt het overgangsrecht
 * 2023-2027: forfaitair rendement **per categorie** + tarief 36%.
 *
 * Categorieën:
 *  - Beleggingen (forfait 6.04% in 2025).
 *  - Spaargeld (forfait 1.44%).
 *  - Schulden (forfait -2.62%, alleen het deel boven drempelschuld).
 *
 * Heffingsvrij vermogen: €57.684 alleenstaand / €115.368 partners.
 * Drempelschulden: €3.800 alleenstaand / €7.600 partners.
 *
 * Bron-disclaimer: tarieven zijn de publiek aangekondigde 2025-cijfers
 * via belastingdienst.nl en wijzigen jaarlijks. Update via
 * `BOX3_RATES_<YEAR>` per nieuw belastingjaar.
 */

// ============================================================
//  Tarieven (gepind op 2025; aanpassen per belastingjaar)
// ============================================================

export interface Box3Rates {
  taxYear: number;
  /** Forfaitair rendement op beleggingen (fractie). */
  notionalReturnInvestments: number;
  /** Forfaitair rendement op spaargeld (fractie). */
  notionalReturnCash: number;
  /** Forfaitair rendement op schulden (negatief — vermindert basis). */
  notionalReturnDebt: number;
  /** Effectief tarief op het fictieve rendement. */
  taxRate: number;
  /** Heffingsvrij vermogen — alleenstaande. */
  exemptionSingle: number;
  /** Heffingsvrij vermogen — fiscale partners. */
  exemptionPartners: number;
  /** Drempelschulden alleenstaand (alleen schulden boven dit bedrag tellen). */
  debtThresholdSingle: number;
  /** Drempelschulden partners. */
  debtThresholdPartners: number;
}

export const BOX3_RATES_2025: Box3Rates = {
  taxYear: 2025,
  notionalReturnInvestments: 0.0604,
  notionalReturnCash: 0.0144,
  notionalReturnDebt: -0.0262,
  taxRate: 0.36,
  exemptionSingle: 57_684,
  exemptionPartners: 115_368,
  debtThresholdSingle: 3_800,
  debtThresholdPartners: 7_600,
};

// ============================================================
//  Engine
// ============================================================

export interface ComputeBox3Input {
  /** Totale belegging-waarde in EUR (peildatum 1 jan). */
  investmentWealth: number;
  /** Spaargeld in EUR (default 0). */
  cashWealth?: number;
  /** Schulden in EUR — positief getal (default 0). */
  debtWealth?: number;
  /** True bij fiscaal partner. Default false. */
  hasFiscalPartner?: boolean;
  /** Override-rates (bv. 2026). */
  rates?: Box3Rates;
  /** Override van het heffingsvrij vermogen. */
  exemptionOverride?: number;
}

export function computeBox3(input: ComputeBox3Input): Box3Calculation {
  const rates = input.rates ?? BOX3_RATES_2025;
  const investments = sanitizePositive(input.investmentWealth);
  const cash = sanitizePositive(input.cashWealth ?? 0);
  const debtRaw = sanitizePositive(input.debtWealth ?? 0);

  const exemption = resolveExemption(rates, input);
  const debtThreshold = resolveDebtThreshold(rates, input);
  const debtAboveThreshold = Math.max(0, debtRaw - debtThreshold);

  // Brutorendement-grondslag: (investments + cash) − debt
  const grossBase = investments + cash - debtAboveThreshold;
  // Heffingsgrondslag = grossBase boven heffingsvrij vermogen.
  const taxableWealth = Math.max(0, grossBase - exemption);

  // Forfait per categorie wordt naar rato van *gross-base* toegewezen
  // aan het belastbare deel — methodiek conform Belastingdienst-uitleg
  // box 3 overgangsregeling.
  const notionalGross =
    investments * rates.notionalReturnInvestments +
    cash * rates.notionalReturnCash +
    debtAboveThreshold * rates.notionalReturnDebt;

  // Naar rato schalen op basis van belastbare aandeel in grondslag.
  const ratio = grossBase > 0 ? taxableWealth / grossBase : 0;
  const notionalIncome = Math.max(0, notionalGross * ratio);
  const taxOwed = notionalIncome * rates.taxRate;

  const portfolioBase = investments + cash;
  const effectiveTaxOnPortfolio =
    portfolioBase > 0 ? taxOwed / portfolioBase : 0;

  // "Hoofdcategorie"-rendement: meest dominante in de mix.
  const dominantRate =
    investments >= cash ? rates.notionalReturnInvestments : rates.notionalReturnCash;

  const rationale: string[] = [
    `Heffingsvrij vermogen ${formatEur(exemption)} ${input.hasFiscalPartner ? "(fiscaal partner)" : "(alleenstaand)"}.`,
  ];
  if (cash > 0) {
    rationale.push(
      `Spaargeld ${formatEur(cash)} × forfait ${(rates.notionalReturnCash * 100).toFixed(2)}%.`,
    );
  }
  if (debtAboveThreshold > 0) {
    rationale.push(
      `Schulden ${formatEur(debtRaw)} (boven drempel ${formatEur(debtThreshold)}: ${formatEur(debtAboveThreshold)}) × forfait ${(rates.notionalReturnDebt * 100).toFixed(2)}%.`,
    );
  }
  rationale.push(
    `Beleggingen ${formatEur(investments)} × forfait ${(rates.notionalReturnInvestments * 100).toFixed(2)}%.`,
  );
  rationale.push(
    `Belastbaar deel: ${formatEur(taxableWealth)} → fictief inkomen ${formatEur(notionalIncome)} × tarief ${(rates.taxRate * 100).toFixed(0)}% = ${formatEur(taxOwed)}.`,
  );

  return {
    taxableWealth,
    exemption,
    notionalReturnRate: dominantRate,
    notionalIncome,
    taxRate: rates.taxRate,
    taxOwed,
    effectiveTaxOnPortfolio,
    rationale,
  };
}

// ============================================================
//  Helpers
// ============================================================

function resolveExemption(rates: Box3Rates, input: ComputeBox3Input): number {
  if (input.exemptionOverride !== undefined && input.exemptionOverride >= 0) {
    return input.exemptionOverride;
  }
  return input.hasFiscalPartner
    ? rates.exemptionPartners
    : rates.exemptionSingle;
}

function resolveDebtThreshold(
  rates: Box3Rates,
  input: ComputeBox3Input,
): number {
  return input.hasFiscalPartner
    ? rates.debtThresholdPartners
    : rates.debtThresholdSingle;
}

function sanitizePositive(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
