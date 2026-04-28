/**
 * CSV-export voor het belasting-overzicht.
 *
 * Bewust géén Excel-specifieke quirks (geen BOM-by-default, geen
 * `sep=`-prefix). De NL-versie van Excel respecteert UTF-8 + komma's
 * meestal prima; importeren via `Data → From Text` is altijd de
 * veiligste route.
 *
 * Output bevat drie blokken, gescheiden door lege regels:
 *
 *   1. Disclaimer (één rij)
 *   2. Peildatum-waarden per jaar
 *   3. Dividend-overzicht per (jaar, land, currency)
 *
 * Cells worden ge-escaped via `escape()` zodat embedded `,` of `"` of
 * newline geen schade aanrichten.
 */

import { TAX_DISCLAIMER_BODY } from "./disclaimer";
import type { DividendYearBucket } from "./dividend-overview";
import type { ValuationOutcome } from "./year-boundary";

function escape(cell: string | number | null): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cells: Array<string | number | null>): string {
  return cells.map(escape).join(",");
}

function n(value: number | null): string {
  return value === null ? "" : value.toFixed(2);
}

export interface BuildCsvInput {
  generatedAt: Date;
  baseCurrency: string;
  valuations: ValuationOutcome[];
  dividends: DividendYearBucket[];
}

export function buildTaxCsv(input: BuildCsvInput): string {
  const lines: string[] = [];

  // Header
  lines.push(row("BeleggerIQ — belastingoverzicht"));
  lines.push(row(`Gegenereerd op: ${input.generatedAt.toISOString()}`));
  lines.push(row(`Basisvaluta: ${input.baseCurrency}`));
  lines.push(row(""));
  lines.push(row("DISCLAIMER"));
  lines.push(row(TAX_DISCLAIMER_BODY));
  lines.push(row(""));

  // Sectie 1 — peildatum-waarden
  lines.push(row("Peildatum-waarden (1 januari)"));
  lines.push(
    row(
      "Belastingjaar",
      "Peildatum",
      "Bron",
      `Waarde (${input.baseCurrency})`,
      "Dagen tot 1-jan",
    ),
  );
  for (const v of input.valuations) {
    lines.push(
      row(
        v.peilYear,
        v.asOf ? v.asOf.slice(0, 10) : "—",
        v.source,
        n(v.value),
        v.daysFromBoundary === null ? "" : v.daysFromBoundary,
      ),
    );
  }
  lines.push(row(""));

  // Sectie 2 — dividenden per jaar / land
  lines.push(row("Dividenden + bronbelasting per land"));
  lines.push(
    row(
      "Jaar",
      "Land",
      "Currency",
      "Bruto dividend",
      "Ingehouden",
      "Verrekenbaar (theoretisch)",
      "Aantal events",
      "Standaard %",
      "Verdrag %",
      "Toelichting",
    ),
  );
  for (const yb of input.dividends) {
    for (const c of yb.byCountry) {
      lines.push(
        row(
          yb.year,
          `${c.country}${c.countryCode ? ` (${c.countryCode})` : ""}`,
          c.currency,
          c.gross.toFixed(2),
          c.withheld.toFixed(2),
          c.reclaimable.toFixed(2),
          c.events,
          (c.defaultRate * 100).toFixed(2),
          (c.treatyRate * 100).toFixed(2),
          c.note ?? "",
        ),
      );
    }
    if (yb.totals.currency) {
      lines.push(
        row(
          yb.year,
          "TOTAAL",
          yb.totals.currency,
          yb.totals.gross.toFixed(2),
          yb.totals.withheld.toFixed(2),
          yb.totals.reclaimable.toFixed(2),
          "",
          "",
          "",
          "",
        ),
      );
    }
  }

  return lines.join("\n") + "\n";
}
