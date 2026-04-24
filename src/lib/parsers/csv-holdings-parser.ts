import type { Holding } from "@/types/portfolio";

import { parseDegiroCsv } from "./degiro";

/**
 * Generieke CSV-parser entry. Dispatchet momenteel naar de DEGIRO-parser;
 * uitbreiden met broker-detectie zodra meer brokers ondersteund worden.
 */

export interface CsvImportResult {
  holdings: Array<Omit<Holding, "id" | "portfolioId">>;
  warnings: string[];
}

export function parseHoldingsCsv(input: string): CsvImportResult {
  const result = parseDegiroCsv(input);
  const skippedWarnings = result.skipped.map(
    (s) => `Rij ${s.row} overgeslagen: ${s.reason}`,
  );

  return {
    holdings: result.holdings.map(({ sourceRow: _sourceRow, ...rest }) => rest),
    warnings: [...result.warnings, ...skippedWarnings],
  };
}
