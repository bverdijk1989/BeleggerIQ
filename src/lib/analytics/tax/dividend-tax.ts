import type { Holding } from "@/types/portfolio";

import type {
  DividendTaxBreakdown,
  DividendTaxPerHolding,
  TaxDomicile,
} from "./types";

/**
 * Dividend-tax engine — indicatief.
 *
 * Modelleert NL-dividendbelasting (15%) + buitenlandse withholding tax
 * (WHT) per domicilie. Voor NL-belegger geldt:
 *   - **NL-aandelen**: 15% NL-dividendbelasting wordt op de
 *     dividenduitkering ingehouden, **volledig verrekenbaar** met
 *     box 3 (we tellen 'm dus credit-tegen).
 *   - **Buitenlandse aandelen**: bronland houdt eigen WHT in. Een
 *     belastingverdrag verlaagt dit vaak (bv. US 30% → 15% met W-8BEN,
 *     DE 26.375% → 15%, FR 25% → 15%, GB 0%, CH 35% → 15%).
 *     Verrekenbaar deel = max 15% met box 3.
 *
 * Aannames (expliciet — UI kan ze tonen):
 *  - We rekenen met de **verdragstarieven** (post W-8BEN / dividend-
 *    formulier), wat realistisch is wanneer belegger een Nederlandse
 *    broker gebruikt die dat regelt.
 *  - Niet-verrekenbaar deel WHT is een verloren cost; verrekenbaar
 *    deel verlaagt de box 3-druk maar dat verrekenen we hier nog niet
 *    aan box 3 (engine geeft beide bedragen terug zodat de UI ze
 *    apart kan tonen).
 *  - UCITS-ETFs domicilie IE/LU: doorlopend kapitaal-fonds; WHT op
 *    onderliggende dividenden is al deels lekkage; we modelleren een
 *    impliciet effectief tarief van ~10%.
 */

// ============================================================
//  WHT-tabel per domicilie (verdragstarieven)
// ============================================================

interface WhtRule {
  domicile: TaxDomicile;
  /** Verdragstarief — wordt typisch ingehouden door bronland. */
  rate: number;
  /** Hoe veel daarvan kan een NL-belegger verrekenen (max 15%). */
  creditableRate: number;
  /** Korte NL-toelichting voor de UI. */
  note: string;
}

const WHT_RULES: Record<TaxDomicile, WhtRule> = {
  NL: {
    domicile: "NL",
    rate: 0.15,
    creditableRate: 0.15,
    note: "NL-dividendbelasting 15% — volledig verrekenbaar met box 3.",
  },
  DE: {
    domicile: "DE",
    rate: 0.15,
    creditableRate: 0.15,
    note: "DE-WHT verdragstarief 15% (na verdrag); volledig verrekenbaar.",
  },
  FR: {
    domicile: "FR",
    rate: 0.15,
    creditableRate: 0.15,
    note: "FR-WHT verdragstarief 15%; volledig verrekenbaar.",
  },
  GB: {
    domicile: "GB",
    rate: 0,
    creditableRate: 0,
    note: "GB houdt geen WHT in op aandelen-dividend.",
  },
  CH: {
    domicile: "CH",
    rate: 0.15,
    creditableRate: 0.15,
    note: "CH-WHT 35% standaard; via verdrag teruggevorderbaar tot 15%.",
  },
  US: {
    domicile: "US",
    rate: 0.15,
    creditableRate: 0.15,
    note: "US-WHT met W-8BEN 15% (zonder formulier 30%); volledig verrekenbaar.",
  },
  IE: {
    domicile: "IE",
    rate: 0.1,
    creditableRate: 0,
    note: "Iers UCITS-fonds — impliciete WHT-lekkage ~10% binnen het fonds, niet verrekenbaar.",
  },
  LU: {
    domicile: "LU",
    rate: 0.1,
    creditableRate: 0,
    note: "Luxemburgs fonds — impliciete WHT-lekkage ~10%, niet verrekenbaar.",
  },
  OTHER: {
    domicile: "OTHER",
    rate: 0.15,
    creditableRate: 0.1,
    note: "Onbekend domicilie — geschat verdragstarief 15%, gedeeltelijk verrekenbaar.",
  },
};

// ============================================================
//  Domicilie-detectie uit ISIN of ticker-suffix
// ============================================================

/**
 * Mapt ISIN-prefix of ticker-suffix naar `TaxDomicile`. Pure functie.
 *
 * - ISIN[0..1] is land-code (bv. NL0010273215 → NL).
 * - Ticker-suffix:
 *   - `.AS` → NL, `.DE` of `.F` → DE, `.PA` → FR, `.L` → GB
 *   - `.SW` → CH
 *   - geen suffix + bekende US-tickers → US (we kunnen niet 100% zeker
 *     weten zonder ISIN)
 */
export function detectDomicile(holding: Holding): TaxDomicile {
  const isin = holding.isin?.trim().toUpperCase();
  if (isin && isin.length >= 2) {
    const code = isin.slice(0, 2);
    if (isCode(code, "NL")) return "NL";
    if (isCode(code, "DE")) return "DE";
    if (isCode(code, "FR")) return "FR";
    if (isCode(code, "GB")) return "GB";
    if (isCode(code, "CH")) return "CH";
    if (isCode(code, "US")) return "US";
    if (isCode(code, "IE")) return "IE";
    if (isCode(code, "LU")) return "LU";
  }
  const ticker = holding.ticker.toUpperCase();
  if (ticker.endsWith(".AS")) return "NL";
  if (ticker.endsWith(".DE") || ticker.endsWith(".F")) return "DE";
  if (ticker.endsWith(".PA")) return "FR";
  if (ticker.endsWith(".L")) return "GB";
  if (ticker.endsWith(".SW")) return "CH";
  if (ticker.endsWith(".MI")) return "OTHER"; // Italië
  if (!ticker.includes(".")) return "US"; // bare tickers ⇒ typisch US
  return "OTHER";
}

function isCode(value: string, code: string): boolean {
  return value === code;
}

// ============================================================
//  Engine
// ============================================================

export interface ComputeDividendTaxInputEntry {
  ticker: string;
  name: string;
  /** Bruto dividend in base currency over de meet-periode. */
  grossDividend: number;
  /** Optionele override van de gedetecteerde domicilie. */
  domicileOverride?: TaxDomicile;
  /** Holding voor domicilie-detectie. */
  holding: Holding;
}

export interface ComputeDividendTaxInput {
  entries: ComputeDividendTaxInputEntry[];
}

export function computeDividendTax(
  input: ComputeDividendTaxInput,
): DividendTaxBreakdown {
  const perHolding: DividendTaxPerHolding[] = input.entries.map((entry) => {
    const domicile = entry.domicileOverride ?? detectDomicile(entry.holding);
    const rule = WHT_RULES[domicile];
    const gross = sanitizeGross(entry.grossDividend);
    const withheld = gross * rule.rate;
    return {
      ticker: entry.ticker,
      name: entry.name,
      domicile,
      grossDividend: gross,
      whtRate: rule.rate,
      withheld,
      netDividend: gross - withheld,
    };
  });

  const grossDividend = perHolding.reduce((s, p) => s + p.grossDividend, 0);
  const totalWithheld = perHolding.reduce((s, p) => s + p.withheld, 0);

  // Splits "withheld" in NL-dividendbelasting vs buitenlandse WHT.
  const dutchDividendTax = perHolding
    .filter((p) => p.domicile === "NL")
    .reduce((s, p) => s + p.withheld, 0);
  const foreignWithholdingTax = totalWithheld - dutchDividendTax;

  const creditableTax = perHolding.reduce((s, p) => {
    const rule = WHT_RULES[p.domicile];
    return s + p.grossDividend * rule.creditableRate;
  }, 0);

  const netDividend = grossDividend - totalWithheld;
  const effectiveTaxRate = grossDividend > 0 ? totalWithheld / grossDividend : 0;

  return {
    grossDividend,
    foreignWithholdingTax,
    dutchDividendTax,
    creditableTax,
    netDividend,
    effectiveTaxRate,
    perHolding,
  };
}

// ============================================================
//  Helpers
// ============================================================

function sanitizeGross(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

export { WHT_RULES };
