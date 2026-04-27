import type { Currency, ISODateString } from "@/types/common";

/**
 * Tax engine — types.
 *
 * **Indicatief model** voor Nederlandse particuliere beleggers.
 * Geen juridisch of fiscaal advies. Reproduceerbare formules met
 * expliciete tarieven; alle drempels staan als constants.
 */

/**
 * Domicilie van een holding. Gebruikt voor witholding tax (WHT) op
 * dividenden. We mappen ISIN-prefix of ticker-suffix naar één van deze
 * landcodes.
 */
export type TaxDomicile =
  | "NL"
  | "DE"
  | "FR"
  | "GB"
  | "CH"
  | "US"
  | "IE" // Irish ETFs (UCITS)
  | "LU" // Luxembourg-domiciled funds
  | "OTHER";

export interface Box3Bracket {
  /** Ondergrens vermogen (EUR). */
  from: number;
  /** Bovengrens (Number.POSITIVE_INFINITY voor laatste tier). */
  to: number;
  /**
   * Forfaitair rendement-aandelen (fractie). Voor 2025: 6.04% op
   * beleggingen, 1.44% op spaargeld, -2.62% op schulden.
   */
  notionalReturn: number;
  label: string;
}

export interface Box3Calculation {
  /** Belastbaar vermogen (na heffingsvrij vermogen). */
  taxableWealth: number;
  /** Heffingsvrij vermogen toegepast (EUR). */
  exemption: number;
  /** Forfaitair rendement gebruikt voor de belegging-categorie. */
  notionalReturnRate: number;
  /** Belastbaar fictief inkomen (EUR). */
  notionalIncome: number;
  /** Effectief tarief op het fictieve inkomen (default 36% in 2025). */
  taxRate: number;
  /** Box 3-belasting in EUR (per jaar). */
  taxOwed: number;
  /** Effectief belastingdruk als fractie van de portefeuille. */
  effectiveTaxOnPortfolio: number;
  /** NL-bullets met de gehanteerde aannames. */
  rationale: string[];
}

export interface DividendTaxBreakdown {
  /** Bruto dividend in base currency. */
  grossDividend: number;
  /** Buitenlandse bronheffing (WHT). */
  foreignWithholdingTax: number;
  /** NL dividendbelasting (15%, verrekenbaar in box 3). */
  dutchDividendTax: number;
  /** Verrekenbaar deel met box 3 (we nemen het maximum verrekend aan). */
  creditableTax: number;
  /** Netto na alle heffingen (vóór box 3). */
  netDividend: number;
  /** Effectieve belastingdruk op dividenden (fractie). */
  effectiveTaxRate: number;
  /** Per holding-breakdown. */
  perHolding: DividendTaxPerHolding[];
}

export interface DividendTaxPerHolding {
  ticker: string;
  name: string;
  domicile: TaxDomicile;
  grossDividend: number;
  whtRate: number;
  withheld: number;
  netDividend: number;
}

export interface NetReturnResult {
  /** Bruto rendement (fractie 0..1). */
  grossReturn: number;
  /** Geschatte belasting-impact als fractie (negatief). */
  taxImpact: number;
  /** Netto rendement (fractie). */
  netReturn: number;
  /** Bedragen in base currency. */
  amounts: {
    grossReturnAmount: number;
    taxAmount: number;
    netReturnAmount: number;
    box3Tax: number;
    dividendTax: number;
    foreignWht: number;
  };
  /** Onderliggende berekeningen — UI kan ze tonen voor transparantie. */
  box3: Box3Calculation;
  dividend: DividendTaxBreakdown;
  /** Lijst NL-warnings (bv. "USA-fonds zonder W-8BEN"). */
  warnings: string[];
  /** 0..1 — coverage / confidence in de berekening. */
  confidence: number;
}

export interface TaxReport {
  generatedAt: ISODateString;
  baseCurrency: Currency;
  taxYear: number;
  result: NetReturnResult;
}
