import type { Currency } from "@/types/common";
import type { AssetClass, Holding } from "@/types/portfolio";

/**
 * DEGIRO CSV importer.
 *
 * Ontworpen voor de "Portefeuille"-export (NL of EN). Bewust fouttolerant:
 *  - Ondersteunt Nederlandse getalnotatie (1.234,56) én Engelse (1,234.56)
 *    via heuristische detectie.
 *  - Accepteert meerdere kolomnaam-varianten (NL/EN synoniemen).
 *  - Slaat rijen over i.p.v. te crashen; verzamelt warnings/skipped rows
 *    zodat de UI feedback kan tonen.
 *  - Aggregeert duplicaten binnen één bestand op ISIN of ticker.
 *
 * Pure module zonder I/O — veilig client- én serverside te gebruiken.
 */

export interface DegiroHolding {
  ticker: string;
  isin: string | null;
  name: string;
  assetClass: AssetClass;
  currency: Currency;
  quantity: number;
  avgCostPrice: number;
  currentPrice: number | null;
  sector: string | null;
  region: string | null;
  /** 1-based rijnummer in het CSV-bestand (incl. header), nuttig voor UI. */
  sourceRow: number;
}

export interface DegiroSkippedRow {
  row: number;
  reason: string;
  values?: Record<string, string>;
}

export interface DegiroImportResult {
  holdings: DegiroHolding[];
  warnings: string[];
  skipped: DegiroSkippedRow[];
  headersDetected: string[];
}

// ============================================================
//  Column aliases (bewust lowercase voor case-insensitive match)
// ============================================================

type CanonicalColumn =
  | "product"
  | "tickerIsin"
  | "isin"
  | "exchange"
  | "quantity"
  | "closingPrice"
  | "localValue"
  | "valueInBase"
  | "currency"
  | "sector";

const COLUMN_ALIASES: Record<CanonicalColumn, string[]> = {
  product: ["product", "naam", "name", "instrument", "omschrijving"],
  tickerIsin: [
    "symbool/isin",
    "symbol/isin",
    "symbool / isin",
    "symbol / isin",
    "ticker/isin",
    "ticker / isin",
    "ticker",
    "symbool",
    "symbol",
  ],
  isin: ["isin"],
  exchange: ["beurs", "exchange", "handelsplaats", "venue"],
  quantity: ["aantal", "quantity", "amount", "stuks", "positie"],
  closingPrice: [
    "slotkoers",
    "closing price",
    "closingprice",
    "koers",
    "price",
    "prijs",
  ],
  localValue: ["lokale waarde", "local value", "waarde lokaal"],
  valueInBase: [
    "waarde in eur",
    "value in eur",
    "waarde",
    "value",
    "waarde in base",
  ],
  currency: ["valuta", "currency"],
  sector: ["sector", "industry", "industrie", "branche"],
};

const REQUIRED_CANONICAL: CanonicalColumn[] = ["product", "quantity"];

// ============================================================
//  Helpers
// ============================================================

/**
 * Leest een string tolerant uit: trim, strip NBSP, retourneer undefined
 * voor lege of null/undefined input. Houdt niet-string input veilig.
 */
export function safeString(input: unknown): string | undefined {
  if (input === null || input === undefined) return undefined;
  const raw = typeof input === "string" ? input : String(input);
  const cleaned = raw.replace(/ /g, " ").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/**
 * Parse Nederlandse getalnotatie ("1.234,56", "-1,5", "EUR 1.234,56") naar
 * een JS-number. Ondersteunt ook Engelse notatie ("1,234.56") via heuristiek:
 *  - Als zowel `.` als `,` voorkomen: het LAATSTE teken is de decimal
 *    separator; eerder voorkomende gelijknamige tekens zijn duizendtallen.
 *  - Alleen `,` → decimal.
 *  - Alleen `.` → integer of US-decimal; als er meerdere `.` zijn, zijn het
 *    duizendtallen (bv. "1.234" → 1234).
 * Retourneert null als de input leeg is of niet parsebaar.
 */
export function normalizeDutchNumber(
  input: string | null | undefined,
): number | null {
  if (input === null || input === undefined) return null;
  const raw = typeof input === "string" ? input : String(input);
  const trimmed = raw.replace(/ /g, " ").trim();
  if (!trimmed) return null;

  // Strip currency-prefix of -suffix ("EUR 1.234,56" of "1.234,56 EUR")
  let cleaned = trimmed.replace(/^[A-Za-z]{3}\s+/, "");
  cleaned = cleaned.replace(/\s+[A-Za-z]{3}$/, "");

  // Percent-suffix ("12,5%")
  const hasPercent = cleaned.endsWith("%");
  if (hasPercent) cleaned = cleaned.slice(0, -1);

  // Remove alle overige spaties (duizendtal-scheidingen in sommige exports)
  cleaned = cleaned.replace(/\s+/g, "");

  // Negatief teken tussen haakjes: "(1.234,56)" → "-1234.56"
  let negative = false;
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }

  if (!cleaned) return null;

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  let normalized: string;
  if (hasComma && hasDot) {
    // Laatste separator = decimal
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Puntloos met komma → decimal
    normalized = cleaned.replace(",", ".");
  } else if (hasDot) {
    // Meerdere punten = duizendtallen (NL). Eén punt is ambigu; in DEGIRO-
    // exports (NL-locale) betekent een punt gevolgd door exact 3 cijfers ook
    // een duizendtal ("1.000" → 1000). Alle andere patronen (bv. "0.5",
    // "1.5", "12.34") blijven als US-decimal behandeld.
    const dotCount = (cleaned.match(/\./g) ?? []).length;
    const looksLikeThousand =
      dotCount === 1 && /^\-?\d{1,3}\.\d{3}$/.test(cleaned);
    normalized =
      dotCount > 1 || looksLikeThousand
        ? cleaned.replace(/\./g, "")
        : cleaned;
  } else {
    normalized = cleaned;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;

  let value = parsed;
  if (negative) value = -value;
  if (hasPercent) value = value / 100;
  return value;
}

const SUPPORTED_CURRENCIES: ReadonlySet<Currency> = new Set([
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "JPY",
]);

/**
 * Detecteert een supported currency-code binnen een string. Kijkt naar
 * stand-alone 3-letter codes (woordgrens). Retourneert null als er geen
 * herkende supported currency is.
 */
export function detectCurrency(
  input: string | null | undefined,
): Currency | null {
  if (input === null || input === undefined) return null;
  const raw = typeof input === "string" ? input : String(input);
  const match = raw
    .toUpperCase()
    .match(/\b(EUR|USD|GBP|CHF|JPY|SEK|NOK|DKK|PLN|HKD|CAD|AUD)\b/);
  if (!match) return null;
  const code = match[1] as Currency;
  return SUPPORTED_CURRENCIES.has(code) ? code : null;
}

// ============================================================
//  CSV tokenizer (RFC 4180-ish, met ; fallback)
// ============================================================

function detectDelimiter(headerLine: string): string {
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;
  const tabCount = (headerLine.match(/\t/g) ?? []).length;
  if (semicolonCount > commaCount && semicolonCount >= tabCount) return ";";
  if (tabCount > commaCount && tabCount > semicolonCount) return "\t";
  return ",";
}

/**
 * Tokenize een CSV-string. Ondersteunt dubbele quotes (""), embedded
 * newlines binnen quotes, en `;` of `,` als delimiter.
 */
function tokenizeCsv(text: string): string[][] {
  // Strip BOM.
  const source = text.replace(/^﻿/, "");

  const firstLineEnd = source.search(/\r?\n/);
  const headerLine = firstLineEnd === -1 ? source : source.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(headerLine);

  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(current);
      current = "";
      continue;
    }
    if (ch === "\n") {
      row.push(current);
      rows.push(row);
      current = "";
      row = [];
      continue;
    }
    if (ch === "\r") continue;
    current += ch;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  // Filter volledig lege regels
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

// ============================================================
//  Header mapping
// ============================================================

type ColumnIndex = Partial<Record<CanonicalColumn, number>>;

function buildColumnIndex(headers: string[]): ColumnIndex {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  const index: ColumnIndex = {};

  (Object.keys(COLUMN_ALIASES) as CanonicalColumn[]).forEach((canonical) => {
    const aliases = COLUMN_ALIASES[canonical];
    for (const alias of aliases) {
      const i = normalized.indexOf(alias);
      if (i !== -1) {
        index[canonical] = i;
        return;
      }
    }
  });

  return index;
}

function readCell(
  cells: string[],
  index: ColumnIndex,
  column: CanonicalColumn,
): string | undefined {
  const position = index[column];
  if (position === undefined) return undefined;
  return safeString(cells[position]);
}

// ============================================================
//  ISIN / ticker detectie
// ============================================================

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{10}$/;

function extractIsinFromString(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const match = input.toUpperCase().match(/\b([A-Z]{2}[A-Z0-9]{10})\b/);
  return match?.[1];
}

function parseTickerIsin(
  combined: string | undefined,
  explicitIsin: string | undefined,
  productName: string | undefined,
): { ticker?: string; isin?: string } {
  const isin =
    (explicitIsin && ISIN_REGEX.test(explicitIsin.toUpperCase())
      ? explicitIsin.toUpperCase()
      : undefined) ?? extractIsinFromString(combined);

  let ticker: string | undefined;
  if (combined) {
    const parts = combined
      .toUpperCase()
      .split(/[\/\s,|]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      if (!ISIN_REGEX.test(part)) {
        ticker = part;
        break;
      }
    }
  }

  // Fallback: gebruik de eerste "woord"-token van de productnaam als ticker
  // (zodat een rij zonder symbol-kolom toch geïmporteerd kan worden).
  if (!ticker && productName) {
    const firstToken = productName
      .toUpperCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^A-Z0-9.]/g, ""))
      .find((t) => t.length > 0);
    if (firstToken) ticker = firstToken;
  }

  return { ticker, isin };
}

// ============================================================
//  Asset class heuristiek
// ============================================================

function inferAssetClass(name: string): AssetClass {
  const upper = name.toUpperCase();
  if (/\b(ETF|UCITS|INDEX|TRACKER|ISHARES|VANGUARD|SPDR)\b/.test(upper)) {
    return "ETF";
  }
  if (/\bREIT\b/.test(upper)) return "REIT";
  if (/\b(BOND|OBLIG)/.test(upper)) return "BOND";
  return "EQUITY";
}

// ============================================================
//  Main parsing pipeline
// ============================================================

interface ParseOpenRowsResult {
  holdings: DegiroHolding[];
  warnings: string[];
  skipped: DegiroSkippedRow[];
}

/**
 * Verwerkt rijen (zonder header) naar schone DegiroHolding-objecten.
 * Filtert automatisch op open posities (quantity > 0), aggregeert
 * duplicaten binnen hetzelfde bestand op ISIN of ticker.
 */
export function parseOpenPositionRows(
  rows: Record<string, string>[],
  options: { headerRowOffset?: number } = {},
): ParseOpenRowsResult {
  const holdings: DegiroHolding[] = [];
  const warnings: string[] = [];
  const skipped: DegiroSkippedRow[] = [];
  const byKey = new Map<string, DegiroHolding>();
  const headerRowOffset = options.headerRowOffset ?? 2;

  let missingCostBasisHint = false;

  rows.forEach((row, idx) => {
    const rowNum = idx + headerRowOffset;

    const name = safeString(row.product ?? row.Product ?? row.naam);
    if (!name) {
      skipped.push({ row: rowNum, reason: "Geen productnaam gevonden", values: row });
      return;
    }

    const quantityRaw = row.quantity ?? row.Aantal ?? row.Amount;
    const quantity = normalizeDutchNumber(quantityRaw);
    if (quantity === null) {
      skipped.push({
        row: rowNum,
        reason: `Kan aantal niet lezen (\"${quantityRaw ?? ""}\")`,
        values: row,
      });
      return;
    }
    if (quantity === 0) {
      skipped.push({ row: rowNum, reason: "Gesloten positie (aantal 0)", values: row });
      return;
    }
    if (quantity < 0) {
      skipped.push({
        row: rowNum,
        reason: "Short positie niet ondersteund in deze versie",
        values: row,
      });
      return;
    }

    const tickerIsinRaw =
      row.tickerIsin ?? row["symbool/isin"] ?? row["Symbol/ISIN"] ?? row.Ticker;
    const explicitIsin = row.isin ?? row.ISIN;
    const { ticker, isin } = parseTickerIsin(
      safeString(tickerIsinRaw),
      safeString(explicitIsin),
      name,
    );

    if (!ticker) {
      skipped.push({
        row: rowNum,
        reason: "Kon geen ticker of ISIN afleiden",
        values: row,
      });
      return;
    }

    const closingRaw = row.closingPrice ?? row.Slotkoers ?? row.Koers;
    const currentPrice = normalizeDutchNumber(closingRaw);
    if (currentPrice === null) {
      warnings.push(`Rij ${rowNum}: geen slotkoers; kostprijs wordt 0 gezet.`);
      missingCostBasisHint = true;
    }

    const currency =
      detectCurrency(row.currency ?? row.Valuta) ??
      detectCurrency(row.localValue ?? row["Lokale waarde"]) ??
      detectCurrency(row.valueInBase ?? row["Waarde in EUR"]) ??
      detectCurrency(row.closingPrice ?? row.Slotkoers) ??
      "EUR";

    const sector = safeString(row.sector ?? row.Sector) ?? null;

    const holding: DegiroHolding = {
      ticker,
      isin: isin ?? null,
      name,
      assetClass: inferAssetClass(name),
      currency,
      quantity,
      avgCostPrice: currentPrice ?? 0,
      currentPrice: currentPrice ?? null,
      sector,
      region: null,
      sourceRow: rowNum,
    };

    const key = holding.isin ?? holding.ticker;
    const existing = byKey.get(key);
    if (existing) {
      // Aggregeer duplicaten: som quantity, weighted-average kostprijs.
      const totalQty = existing.quantity + holding.quantity;
      const totalCost =
        existing.avgCostPrice * existing.quantity +
        holding.avgCostPrice * holding.quantity;
      existing.quantity = totalQty;
      existing.avgCostPrice = totalQty === 0 ? 0 : totalCost / totalQty;
      if (holding.currentPrice !== null) {
        existing.currentPrice = holding.currentPrice;
      }
      warnings.push(
        `Rij ${rowNum}: duplicaat voor ${key} samengevoegd met eerdere regel.`,
      );
    } else {
      byKey.set(key, holding);
      holdings.push(holding);
    }
  });

  if (missingCostBasisHint) {
    warnings.push(
      "DEGIRO portefeuille-export bevat geen kostprijs. Werk de kostprijs handmatig bij of importeer een transactie-export.",
    );
  } else if (holdings.length > 0) {
    warnings.push(
      "DEGIRO portefeuille-export bevat geen kostprijs: slotkoers wordt gebruikt als tijdelijke kostprijs.",
    );
  }

  return {
    holdings: Array.from(byKey.values()),
    warnings,
    skipped,
  };
}

// ============================================================
//  Public entry: parseDegiroCsv
// ============================================================

export function parseDegiroCsv(csvText: string): DegiroImportResult {
  const empty: DegiroImportResult = {
    holdings: [],
    warnings: [],
    skipped: [],
    headersDetected: [],
  };

  if (!csvText || !csvText.trim()) {
    return { ...empty, warnings: ["Leeg of ongeldig CSV-bestand."] };
  }

  const table = tokenizeCsv(csvText);
  if (table.length === 0) {
    return { ...empty, warnings: ["Kon geen data detecteren in de CSV."] };
  }

  const headers = table[0]!.map((h) => h.trim());
  const index = buildColumnIndex(headers);

  const missing = REQUIRED_CANONICAL.filter((col) => index[col] === undefined);
  if (missing.length > 0) {
    return {
      ...empty,
      headersDetected: headers,
      warnings: [
        `Verplichte kolom(men) niet gevonden: ${missing.join(", ")}. ` +
          "Controleer of dit een DEGIRO \"Portefeuille\"-export is.",
      ],
    };
  }

  // Map de ruwe cellen naar een object met canonieke keys zodat
  // parseOpenPositionRows los testbaar is op gestructureerde input.
  const mapped: Record<string, string>[] = table.slice(1).map((cells) => {
    const obj: Record<string, string> = {};
    (Object.keys(COLUMN_ALIASES) as CanonicalColumn[]).forEach((canonical) => {
      const value = readCell(cells, index, canonical);
      if (value !== undefined) obj[canonical] = value;
    });
    return obj;
  });

  const { holdings, warnings, skipped } = parseOpenPositionRows(mapped);

  return {
    holdings,
    warnings,
    skipped,
    headersDetected: headers,
  };
}

// ============================================================
//  Mapping naar Holding (Omit id/portfolioId) — voor server actions
// ============================================================

export type HoldingDraft = Omit<
  Holding,
  "id" | "portfolioId" | "metadata" | "beta" | "volatility" | "factorScore" | "riskAnalysis"
>;

/**
 * Strip het parser-specifieke `sourceRow` veld zodat het resultaat
 * één-op-één in `prisma.holding.upsert` past.
 */
export function toHoldingDrafts(holdings: DegiroHolding[]): HoldingDraft[] {
  return holdings.map((h) => ({
    ticker: h.ticker,
    isin: h.isin,
    name: h.name,
    assetClass: h.assetClass,
    currency: h.currency,
    quantity: h.quantity,
    avgCostPrice: h.avgCostPrice,
    currentPrice: h.currentPrice,
    sector: h.sector,
    region: h.region,
  }));
}
