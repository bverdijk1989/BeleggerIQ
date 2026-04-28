/**
 * Serializers voor manual-broker order-export.
 *
 * Twee formats:
 *   - **CSV** (komma-gescheiden) voor download + Excel-import
 *   - **TSV** (tab-gescheiden) voor copy-paste naar Google Sheets / Excel
 *     zonder dat de gebruiker hoeft te kiezen "delimiter is komma"
 *
 * **Disclaimer als eerste regel.** Wie het CSV later ontvangt (jezelf
 * met cold-context, of een accountant) moet meteen zien dat dit GEEN
 * uitvoer-instructie is maar een suggestie.
 */

import type { OrderRow } from "./build-orders";

export const ORDER_DISCLAIMER =
  "BeleggerIQ-suggestie. Geen uitvoeringsadvies. De gebruiker is zelf verantwoordelijk voor het plaatsen, controleren en verwerken van orders bij de broker.";

const HEADERS = [
  "Ticker",
  "ISIN",
  "Naam",
  "Side",
  "Bedrag",
  "Aantal",
  "Quote",
  "Currency",
  "Order type",
  "Limit prijs",
  "Toelichting",
];

function escapeCsvCell(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function escapeTsvCell(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  // Bij TSV vervangen we tabs en newlines simpelweg door spaties — dat
  // komt zelden voor in deze velden en houdt de output 1-rij-per-order.
  return String(cell).replace(/[\t\n\r]+/g, " ");
}

function rowCells(row: OrderRow): Array<string | number | null> {
  return [
    row.ticker,
    row.isin ?? "",
    row.name ?? "",
    row.side,
    row.amount.toFixed(2),
    row.quantity,
    row.latestQuote !== null ? row.latestQuote.toFixed(2) : "",
    row.quoteCurrency ?? "",
    row.orderType,
    row.limitPrice !== null ? row.limitPrice.toFixed(2) : "",
    row.note ?? "",
  ];
}

export function buildOrderCsv(rows: OrderRow[]): string {
  const lines: string[] = [];
  lines.push(escapeCsvCell(ORDER_DISCLAIMER));
  lines.push(HEADERS.map(escapeCsvCell).join(","));
  for (const row of rows) {
    lines.push(rowCells(row).map(escapeCsvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

export function buildOrderTsv(rows: OrderRow[]): string {
  const lines: string[] = [];
  lines.push(escapeTsvCell(ORDER_DISCLAIMER));
  lines.push(HEADERS.map(escapeTsvCell).join("\t"));
  for (const row of rows) {
    lines.push(rowCells(row).map(escapeTsvCell).join("\t"));
  }
  return lines.join("\n");
}
