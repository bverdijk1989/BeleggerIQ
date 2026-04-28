/**
 * DEGIRO Account-CSV parser.
 *
 * DEGIRO biedt twee export-formaten:
 *   - **Account.csv** ("Rekening overzicht") — alle cash-flows: BUY/SELL,
 *     dividenden, fees, FX-conversies. Dit is het rijkste formaat en wat
 *     deze parser ondersteunt.
 *   - **Transactions.csv** ("Transacties") — alleen orders (BUY/SELL).
 *     Toekomst: een tweede parser, of negeer omdat Account.csv 'em dekt.
 *
 * Headers in NL-export (de variant die 99% van de Nederlandse gebruikers
 * krijgt):
 *
 *   Datum, Tijd, Valutadatum, Product, ISIN, Omschrijving, FX,
 *   Mutatie, "" (currency-mutation amount), Saldo, "" (saldo currency), Order Id
 *
 * Voorbeelden uit een echte export (afgeleid):
 *   30-12-2025,12:34,30-12-2025,ASML,NL0010273215,DEGIRO transactiekosten,,EUR,"-2,00",EUR,"1.234,56",abc-123
 *   30-12-2025,12:34,30-12-2025,ASML,NL0010273215,Koop 5 @ 600,00 EUR,,EUR,"-3.000,00",EUR,"-1.765,44",abc-123
 *   02-01-2026,09:00,02-01-2026,APPLE INC. - COMMON ST,US0378331005,Dividend,,USD,"12,34",USD,"50,00",
 *
 * Strategie:
 *   - Parse het ruwe veld eerst tot {raw, isin, datum, omschrijving, mutatie}.
 *   - Detecteer type op basis van `omschrijving` (NL prefix-matching) +
 *     hints uit `mutatie`-teken.
 *   - Voor BUY/SELL extraheren we `quantity` + `price` uit de omschrijving
 *     (regex op "Koop|Verkoop {qty} @ {price} {ccy}").
 *   - Onbegrepen rijen → `errors[]` met reden, zodat de UI ze kan tonen.
 *
 * Conservatief: beter een rij in `errors` dan een verkeerd geparseerde
 * BUY die de FIFO-engine corrupt maakt.
 */

import { parseCsv } from "./csv";
import { parseDutchNumber } from "./dutch-number";
import type { ParseResult, ParsedTransaction, TxType } from "./types";

const KNOWN_HEADERS = [
  "datum",
  "tijd",
  "product",
  "isin",
  "omschrijving",
  "mutatie",
  "order id",
];

const DEGIRO_SOURCE = "degiro";

interface RawRow {
  rowIndex: number;
  raw: Record<string, string>;
  datum: string;
  tijd: string;
  product: string;
  isin: string;
  omschrijving: string;
  /** Waarde-cell (kan leeg zijn voor 0-rijen). */
  mutatieValue: string;
  mutatieCurrency: string;
  orderId: string;
}

function pick(row: Record<string, string>, candidates: string[]): string {
  for (const key of Object.keys(row)) {
    const k = key.trim().toLowerCase();
    if (candidates.includes(k)) return row[key] ?? "";
  }
  return "";
}

/**
 * DEGIRO heeft de mutatie-cell gesplitst in twee kolommen:
 * een currency-cell en een waarde-cell, in onbekende volgorde tussen
 * exports. We pakken het "Mutatie"-veld + de cel direct erna.
 */
function pickMutation(row: Record<string, string>): {
  value: string;
  currency: string;
} {
  const keys = Object.keys(row);
  // DEGIRO heeft twee "Mutatie"-blokken: de eerste = currency-code, de
  // tweede (anonymous, "" header) = bedrag in die currency. Daarna komt
  // "Saldo" (currency) + lege kolom (saldo-bedrag). Pak het paar
  // (Mutatie-cell, volgende kolom). De dis-ambiguating CSV-parser maakt
  // van de tweede lege header `col_<idx>`.
  const mutIdx = keys.findIndex(
    (k) => k.trim().toLowerCase() === "mutatie",
  );
  if (mutIdx === -1) return { value: "", currency: "" };
  const currencyKey = keys[mutIdx];
  const valueKey = keys[mutIdx + 1];
  return {
    currency: (currencyKey ? row[currencyKey] : "") ?? "",
    value: (valueKey ? row[valueKey] : "") ?? "",
  };
}

function parseDate(datum: string, tijd: string): Date | null {
  // Formats: dd-mm-yyyy, dd/mm/yyyy. tijd: HH:mm of HH:mm:ss.
  const dm = datum.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (!dm) return null;
  const day = Number(dm[1]);
  const month = Number(dm[2]);
  const year = Number(dm[3]);
  let hour = 0;
  let minute = 0;
  let second = 0;
  if (tijd) {
    const tm = tijd.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (tm) {
      hour = Number(tm[1]);
      minute = Number(tm[2]);
      second = tm[3] ? Number(tm[3]) : 0;
    }
  }
  // We interpreteren als UTC zodat tijdzone-shifts geen rij-volgorde
  // breken; de `executedAt` is informatie-rijk genoeg voor jaarrapportage.
  const ms = Date.UTC(year, month - 1, day, hour, minute, second);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

interface ClassifyResult {
  type: TxType;
  quantity: number | null;
  price: number | null;
  /** Tekstueel restant voor metadata. */
  detail: string;
}

const TRADE_REGEX =
  /(koop|verkoop)\s+([\d.,]+)\s*@\s*([\d.,]+)\s*([A-Z]{3})/i;

/**
 * Classificeer een DEGIRO-rij op basis van de omschrijving.
 *
 * Volgorde matters — meer-specifieke patronen eerst.
 */
function classify(omschrijving: string, mutatieValue: number | null): ClassifyResult | null {
  const o = omschrijving.toLowerCase().trim();

  // BUY/SELL — formaat "Koop 5 @ 600,00 EUR" / "Verkoop 5 @ 605,00 EUR"
  const trade = omschrijving.match(TRADE_REGEX);
  if (trade) {
    const action = trade[1]!.toLowerCase();
    const qtyR = parseDutchNumber(trade[2] ?? "");
    const priceR = parseDutchNumber(trade[3] ?? "");
    if (!qtyR.ok || !priceR.ok) return null;
    return {
      type: action.startsWith("k") ? "BUY" : "SELL",
      quantity: qtyR.value,
      price: priceR.value,
      detail: omschrijving,
    };
  }

  // Transactiekosten / handelskosten
  if (o.includes("transactiekosten") || o.includes("connectiekosten") || o.includes("handelskosten")) {
    return { type: "FEE", quantity: null, price: null, detail: omschrijving };
  }

  // Dividend
  if (o === "dividend" || o.startsWith("dividend ") || o.includes("dividend")) {
    if (o.includes("dividendbelasting") || o.includes("withholding")) {
      return { type: "TAX", quantity: null, price: null, detail: omschrijving };
    }
    return { type: "DIVIDEND", quantity: null, price: null, detail: omschrijving };
  }

  // Belasting
  if (o.includes("belasting") || o.includes("withholding tax")) {
    return { type: "TAX", quantity: null, price: null, detail: omschrijving };
  }

  // Rente
  if (o.includes("rente") || o.includes("interest")) {
    return { type: "INTEREST", quantity: null, price: null, detail: omschrijving };
  }

  // FX-conversie
  if (
    o.includes("valuta credit") ||
    o.includes("valuta debet") ||
    o.includes("fx") ||
    o.includes("currency")
  ) {
    return { type: "FX", quantity: null, price: null, detail: omschrijving };
  }

  // Storting / opname
  if (
    o.includes("ideal") ||
    o.includes("storting") ||
    o.includes("opname") ||
    o.includes("withdrawal") ||
    o.includes("deposit")
  ) {
    return { type: "CASH", quantity: null, price: null, detail: omschrijving };
  }

  // Generic — als er een mutatie-bedrag is, behandel als ADJUSTMENT (we
  // verliezen 'm liever niet, maar markeren expliciet dat we het type
  // niet konden infereren).
  if (mutatieValue !== null) {
    return { type: "ADJUSTMENT", quantity: null, price: null, detail: omschrijving };
  }
  return null;
}

function buildExternalId(parts: {
  orderId: string;
  executedAt: Date;
  isin: string;
  type: TxType;
  signedAmount: number | null;
}): string {
  if (parts.orderId && parts.orderId.trim()) {
    // Order-id alleen is niet uniek (BUY + losse FEE delen 'em). Combineer
    // 'em met type + bedrag zodat dedup werkt.
    return `degiro:${parts.orderId}:${parts.type}:${parts.signedAmount ?? "x"}`;
  }
  // Geen order-id (typisch voor dividenden) → hash van executed/isin/type/amount.
  return `degiro:${parts.executedAt.toISOString()}:${parts.isin || "noisin"}:${parts.type}:${parts.signedAmount ?? "x"}`;
}

export function parseDegiroCsv(content: string): ParseResult {
  const csv = parseCsv(content);
  const result: ParseResult = {
    transactions: [],
    errors: [],
    rowsSeen: csv.rows.length,
  };

  if (csv.headers.length === 0) {
    return result;
  }

  // Valideer dat we ten minste de kern-kolommen hebben — anders is dit
  // duidelijk geen DEGIRO-export.
  const lowerHeaders = csv.headers.map((h) => h.toLowerCase());
  const missing = KNOWN_HEADERS.filter(
    (h) => !lowerHeaders.some((lh) => lh.includes(h)),
  );
  if (missing.length > 2) {
    result.errors.push({
      rowIndex: -1,
      rawRow: {},
      reason: `not_a_degiro_csv:missing_headers:${missing.join(",")}`,
    });
    return result;
  }

  csv.rows.forEach((row, idx) => {
    const datum = pick(row, ["datum", "date"]);
    const tijd = pick(row, ["tijd", "time"]);
    const product = pick(row, ["product"]);
    const isin = pick(row, ["isin"]);
    const omschrijving = pick(row, ["omschrijving", "description"]);
    const orderId = pick(row, ["order id", "orderid", "order-id"]);
    const mut = pickMutation(row);

    if (!datum) {
      // Een lege data-rij (DEGIRO export bevat soms summary-rijen onderaan)
      // — sla 'em over zonder als error te markeren.
      return;
    }

    const executedAt = parseDate(datum, tijd);
    if (!executedAt) {
      result.errors.push({
        rowIndex: idx,
        rawRow: row,
        reason: `invalid_date:${datum} ${tijd}`,
      });
      return;
    }

    const mutResult = parseDutchNumber(mut.value);
    const mutValue = mutResult.ok ? mutResult.value : null;
    if (mut.value && !mutResult.ok) {
      result.errors.push({
        rowIndex: idx,
        rawRow: row,
        reason: `invalid_amount:${mutResult.reason}`,
      });
      return;
    }

    const cls = classify(omschrijving, mutValue);
    if (!cls) {
      result.errors.push({
        rowIndex: idx,
        rawRow: row,
        reason: `unrecognized_description:${omschrijving}`,
      });
      return;
    }

    // Voor BUY/SELL: signedAmount = -qty*price ± fees komt uit eigen FEE-rij.
    // We slaan signedAmount direct over uit de mutatie-cel zodat we niet
    // afhankelijk zijn van het al-dan-niet aanwezige - teken in `mutatieValue`.
    const signedAmount = mutValue;
    const fee =
      cls.type === "FEE" && signedAmount !== null
        ? Math.abs(signedAmount)
        : null;

    const externalId = buildExternalId({
      orderId,
      executedAt,
      isin,
      type: cls.type,
      signedAmount,
    });

    const tx: ParsedTransaction = {
      externalId,
      source: DEGIRO_SOURCE,
      type: cls.type,
      ticker: null, // DEGIRO levert geen ticker; de ticker-resolver kan 'em later vullen via ISIN
      isin: isin || null,
      name: product || null,
      quantity: cls.quantity,
      price: cls.price,
      fee,
      signedAmount,
      currency: (mut.currency || "EUR").toUpperCase(),
      executedAt,
      metadata: {
        orderId: orderId || null,
        omschrijving,
        rawDatum: datum,
        rawTijd: tijd,
      },
    };

    result.transactions.push(tx);
  });

  return result;
}
