import type { InstrumentType, IncomeStrategy } from "./types";

/**
 * ETF lookthrough — classificatie van een fonds op basis van naam
 * + metadata, *niet* de onderliggende holdings.
 *
 * Waarom niet de echte holdings? Die data vereist een externe feed
 * (ETF.com, Holdings API) met eigen license-structuur. Voor onze
 * use-case (risk/policy rules differentiëren per ETF-type) is naam-
 * pattern-matching robuust genoeg: fondshuizen benoemen hun producten
 * consequent ("UCITS", "COVERED CALL", "TECHNOLOGY", ...).
 *
 * Alle functies zijn pure: zelfde input → zelfde output. Geen network,
 * geen side-effects.
 */

interface KeywordRule {
  /** Elke pattern die matcht triggert deze categorie. Alle strings zijn
   *  uppercase geïnterpreteerd — de caller normaliseert vooraf. */
  patterns: RegExp[];
  reason: string;
}

/**
 * Match-volgorde is belangrijk: specifieker eerst (bv. COVERED CALL
 * moet BEFORE generic "dividend" worden getest), leveraged vóór alles
 * omdat een "3x Technology ETF" speculatief EN sector is — we willen
 * 'm als LEVERAGED_OR_INVERSE classificeren omdat dat gedrag domineert.
 */
const LEVERAGED_RULES: KeywordRule = {
  patterns: [
    /\b(3X|2X|LEVERAGED|BEAR|BULL\s*\d+X)\b/,
    /\b(INVERSE|SHORT\s*(\d+X)?)\b/,
    /\bULTRA(\s*PRO)?\b/, // ProShares Ultra & UltraPro
  ],
  reason: "Leveraged of inverse ETF — hoog risico, speculatief.",
};

const COVERED_CALL_RULES: KeywordRule = {
  patterns: [
    /\bCOVERED\s*CALL\b/,
    /\bBUY[-\s]?WRITE\b/,
    /\b(JEPI|JEPQ|QYLD|XYLD|RYLD|YMAX|QDTE)\b/, // Bekende tickers
    /\bPREMIUM\s*INCOME\b/,
    /\bOPTIONS\s*INCOME\b/,
  ],
  reason: "Covered-call strategie — dividend + geschreven opties.",
};

const HIGH_DIVIDEND_RULES: KeywordRule = {
  patterns: [
    /\bHIGH\s*(DIV(IDEND)?|YIELD)\b/,
    /\bDIV(IDEND)?\s*ARISTOCRATS?\b/,
    /\bDIV(IDEND)?\s*(FOCUS|INCOME|LEADER|GROWTH)\b/,
    /\bSCHD\b/, // Schwab US Dividend Equity
  ],
  reason: "High-dividend equity ETF — income uit aandelen.",
};

const BOND_RULES: KeywordRule = {
  patterns: [
    /\b(BOND|AGGREGATE|TREASUR(Y|IES)|GILT|GOVT|CORPORATE\s*BOND|HIGH\s*YIELD\s*BOND)\b/,
    /\b(AGG|TLT|HYG|LQD|IEF|SHY)\b/, // iShares & BlackRock bond tickers
    /\bFIXED\s*INCOME\b/,
  ],
  reason: "Bond-ETF — vastrentende exposure.",
};

const BROAD_MARKET_RULES: KeywordRule = {
  patterns: [
    /\bS\s*&?\s*P\s*500\b/,
    /\bMSCI\s*WORLD\b/,
    /\bFTSE\s*(ALL[-\s]?WORLD|100|250)\b/,
    /\b(IWDA|VWCE|VWRL|VUSA|VOO|VTI|CSPX|EUNL|IUSA|SPY|SPLG)\b/,
    /\b(ACWI|TOTAL\s*(STOCK|MARKET|WORLD)|ALL[-\s]?COUNTRY)\b/,
    /\bEURO\s*STOXX\s*50\b/,
    /\b(CAC\s*40|DAX|NIKKEI|FTSE\s*100|NASDAQ\s*100)\b/,
  ],
  reason: "Breed-gespreid index-ETF (blue-chip benchmark).",
};

const SECTOR_KEYWORDS: Array<{ patterns: RegExp[]; sector: string }> = [
  { patterns: [/\b(TECHNOLOGY|TECH\s*SECTOR|SEMICONDUCTOR|SOFTWARE)\b/], sector: "Technology" },
  { patterns: [/\b(HEALTHCARE|HEALTH\s*CARE|PHARMA|BIOTECH(NOLOGY)?)\b/], sector: "Healthcare" },
  { patterns: [/\b(FINANCIAL|BANKING|BANKS)\b/], sector: "Financials" },
  { patterns: [/\b(ENERGY|OIL\s*&?\s*GAS|CLEAN\s*ENERGY|RENEWABLE)\b/], sector: "Energy" },
  { patterns: [/\b(UTILIT(Y|IES))\b/], sector: "Utilities" },
  { patterns: [/\b(REAL\s*ESTATE|REIT|PROPERTY)\b/], sector: "Real Estate" },
  { patterns: [/\b(CONSUMER\s*(DISCRETIONARY|STAPLES)|RETAIL|FOOD)\b/], sector: "Consumer" },
  { patterns: [/\b(INDUSTRIAL|AEROSPACE|DEFENSE)\b/], sector: "Industrials" },
  { patterns: [/\b(MATERIAL|METAL|MINING)\b/], sector: "Materials" },
  { patterns: [/\b(COMMUNICATION\s*SERVICES|TELECOM)\b/], sector: "Communication Services" },
];

const FACTOR_KEYWORDS: RegExp[] = [
  /\bQUALITY\b/,
  /\bMOMENTUM\b/,
  /\bVALUE\b/,
  /\b(MIN(IMUM)?\s*VOL(ATILITY)?)\b/,
  /\bLOW\s*VOL(ATILITY)?\b/,
  /\bSMALL\s*CAP\b/,
  /\bMID\s*CAP\b/,
  /\bMULTI[-\s]?FACTOR\b/,
];

const THEME_KEYWORDS: RegExp[] = [
  /\b(AI|ARTIFICIAL\s*INTELLIGENCE)\b/,
  /\bROBOTICS?\b/,
  /\bCYBER(SECURITY)?\b/,
  /\bCANNABIS\b/,
  /\bSPACE\b/,
  /\bBLOCKCHAIN\b/,
  /\bAUTONOMOUS\s*(VEHICLE|DRIV)/,
  /\bBATTERY\b/,
  /\bSOLAR\b/,
  /\bGENOMICS?\b/,
  /\bESG\b/, // debatable, maar thematisch
  /\bSUSTAINAB(LE|ILITY)\b/,
];

const COMMODITY_KEYWORDS: RegExp[] = [
  /\bGOLD\b/,
  /\bSILVER\b/,
  /\bOIL\b/,
  /\bGAS\b/,
  /\bCOMMODIT(Y|IES)\b/,
  /\bPRECIOUS\s*METAL/,
  /\bCOPPER\b/,
  /\bAGRICULTURE\b/,
];

function matchesAny(haystack: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(haystack));
}

/**
 * Bepaal de ETF-subcategorie op basis van de naam (en eventueel de
 * sector uit enrichment). Retourneert zowel het type als een rationale
 * zodat callers de beslissing kunnen laten zien.
 */
export interface ClassifyEtfInput {
  name: string;
  /** Sector-label uit Yahoo's `assetProfile`, indien bekend. */
  enrichmentSector?: string | null;
}

export interface ClassifyEtfResult {
  type: Extract<
    InstrumentType,
    | "BROAD_MARKET_ETF"
    | "SECTOR_ETF"
    | "FACTOR_ETF"
    | "THEME_ETF"
    | "INCOME_ETF"
    | "BOND_ETF"
    | "COMMODITY_ETF"
    | "LEVERAGED_OR_INVERSE"
    | "UNKNOWN_ETF"
  >;
  rationale: string[];
  incomeStrategy: IncomeStrategy | null;
  sectorFocus: string | null;
  isBroadMarket: boolean;
}

export function classifyEtfByName(input: ClassifyEtfInput): ClassifyEtfResult {
  const name = (input.name ?? "").toUpperCase();
  const rationale: string[] = [];

  // 1) Leveraged / inverse heeft voorrang — speculatief karakter domineert.
  if (matchesAny(name, LEVERAGED_RULES.patterns)) {
    return {
      type: "LEVERAGED_OR_INVERSE",
      rationale: [LEVERAGED_RULES.reason],
      incomeStrategy: null,
      sectorFocus: null,
      isBroadMarket: false,
    };
  }

  // 2) Covered-call before other income rules — meer specifiek.
  if (matchesAny(name, COVERED_CALL_RULES.patterns)) {
    return {
      type: "INCOME_ETF",
      rationale: [COVERED_CALL_RULES.reason],
      incomeStrategy: "covered-call",
      sectorFocus: null,
      isBroadMarket: false,
    };
  }

  // 3) Bond ETFs.
  if (matchesAny(name, BOND_RULES.patterns)) {
    const isIncome = /\bINCOME\b/.test(name);
    return {
      type: isIncome ? "INCOME_ETF" : "BOND_ETF",
      rationale: [BOND_RULES.reason],
      incomeStrategy: isIncome ? "bond-heavy" : null,
      sectorFocus: null,
      isBroadMarket: false,
    };
  }

  // 4) High-dividend equity (NA covered-call).
  if (matchesAny(name, HIGH_DIVIDEND_RULES.patterns)) {
    return {
      type: "INCOME_ETF",
      rationale: [HIGH_DIVIDEND_RULES.reason],
      incomeStrategy: "high-dividend",
      sectorFocus: null,
      isBroadMarket: false,
    };
  }

  // 5) Commodity exposure.
  if (matchesAny(name, COMMODITY_KEYWORDS)) {
    return {
      type: "COMMODITY_ETF",
      rationale: ["Commodity-tracker — grondstof exposure."],
      incomeStrategy: null,
      sectorFocus: null,
      isBroadMarket: false,
    };
  }

  // 6) Broad-market eerst (voorkomt dat "S&P 500 Technology" als pure
  //    sector wordt geclassificeerd — dat is een sub-index maar wel breed
  //    t.o.v. single stocks; we kiezen bewust voor broad-market wanneer
  //    de index-naam matcht).
  if (matchesAny(name, BROAD_MARKET_RULES.patterns)) {
    rationale.push(BROAD_MARKET_RULES.reason);

    // Als ook een sector-keyword matcht → eigenlijk sector, niet broad.
    const sector = SECTOR_KEYWORDS.find((s) => matchesAny(name, s.patterns));
    if (sector) {
      return {
        type: "SECTOR_ETF",
        rationale: [
          `Sector-ETF binnen brede index (${sector.sector}).`,
        ],
        incomeStrategy: null,
        sectorFocus: sector.sector,
        isBroadMarket: false,
      };
    }
    return {
      type: "BROAD_MARKET_ETF",
      rationale,
      incomeStrategy: null,
      sectorFocus: null,
      isBroadMarket: true,
    };
  }

  // 7) Sector-ETFs.
  const sectorMatch = SECTOR_KEYWORDS.find((s) => matchesAny(name, s.patterns));
  if (sectorMatch) {
    return {
      type: "SECTOR_ETF",
      rationale: [`Sector-gericht ETF (${sectorMatch.sector}).`],
      incomeStrategy: null,
      sectorFocus: sectorMatch.sector,
      isBroadMarket: false,
    };
  }

  // 8) Factor-ETFs.
  if (matchesAny(name, FACTOR_KEYWORDS)) {
    return {
      type: "FACTOR_ETF",
      rationale: ["Factor-gericht ETF (quality / momentum / value / ...)."],
      incomeStrategy: null,
      sectorFocus: null,
      isBroadMarket: false,
    };
  }

  // 9) Thema-ETFs.
  if (matchesAny(name, THEME_KEYWORDS)) {
    return {
      type: "THEME_ETF",
      rationale: ["Thema-ETF — exposure op een narratief of trend."],
      incomeStrategy: null,
      sectorFocus: null,
      isBroadMarket: false,
    };
  }

  // 10) Fallback: ETF, maar specifiek genre onbekend.
  const fallback: string[] = ["ETF herkend, maar subcategorie onbekend uit naam."];
  // Als Yahoo ons een sector meegeeft, dan zetten we 'm als beste gok.
  if (input.enrichmentSector) {
    fallback.push(
      `Yahoo-sector "${input.enrichmentSector}" als fallback meegenomen.`,
    );
    return {
      type: "SECTOR_ETF",
      rationale: fallback,
      incomeStrategy: null,
      sectorFocus: input.enrichmentSector,
      isBroadMarket: false,
    };
  }
  return {
    type: "UNKNOWN_ETF",
    rationale: fallback,
    incomeStrategy: null,
    sectorFocus: null,
    isBroadMarket: false,
  };
}

/**
 * Exposed voor tests + advanced callers. Elke regel is een pure pattern-
 * check zodat we edge-cases onafhankelijk kunnen verifiëren.
 */
export const INTERNAL_PATTERNS = {
  LEVERAGED_RULES,
  COVERED_CALL_RULES,
  HIGH_DIVIDEND_RULES,
  BOND_RULES,
  BROAD_MARKET_RULES,
  SECTOR_KEYWORDS,
  FACTOR_KEYWORDS,
  THEME_KEYWORDS,
  COMMODITY_KEYWORDS,
};
