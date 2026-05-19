/**
 * Signal Performance — CSV exporter (Module 27).
 *
 * Pure functie: report → RFC 4180-compatibele CSV-string.
 *
 * **Format**: per-component-per-horizon één rij. Numerieke velden in
 * decimaal-punt-formaat (Excel/Numbers/Google Sheets-compatible).
 * Geen header-emoji, geen BOM (UTF-8 plain).
 */

import {
  REGIME_LABELS,
  SIGNAL_COMPONENT_LABELS,
  type SignalPerformanceReport,
} from "./types";

/**
 * Bouw CSV van het volledige rapport. Inhoudt 3 secties:
 *  1. Component performance (component × horizon)
 *  2. Regime breakdown (component × regime, op 12m)
 *  3. Disclaimer-regel
 */
export function buildSignalPerformanceCsv(
  report: SignalPerformanceReport,
): string {
  const lines: string[] = [];

  lines.push("# Signal Performance Lab — gegenereerd " + report.generatedAt);
  lines.push("# Totaal observaties: " + report.totalObservations);
  if (report.globalWarning) {
    lines.push("# WAARSCHUWING: " + report.globalWarning);
  }
  lines.push("");

  // --- Sectie 1: per-component per-horizon
  lines.push("# Sectie 1: per-component performance");
  lines.push(
    [
      "component",
      "horizon",
      "sample_size",
      "information_coefficient",
      "hit_rate",
      "long_short_spread",
      "top_quintile_return",
      "bottom_quintile_return",
      "false_positives",
      "false_negatives",
      "warning",
    ].join(","),
  );

  for (const comp of report.components) {
    for (const row of comp.byHorizon) {
      lines.push(
        [
          csvEscape(comp.component),
          csvEscape(row.horizon),
          row.sampleSize.toString(),
          fmtNum(row.informationCoefficient),
          fmtNum(row.hitRate),
          fmtNum(row.longShortSpread),
          fmtNum(row.topQuintileReturn),
          fmtNum(row.bottomQuintileReturn),
          row.falsePositiveCount.toString(),
          row.falseNegativeCount.toString(),
          csvEscape(row.warning ?? ""),
        ].join(","),
      );
    }
  }
  lines.push("");

  // --- Sectie 2: regime-breakdown
  lines.push("# Sectie 2: regime-breakdown (12m horizon)");
  lines.push(
    [
      "component",
      "regime",
      "sample_size",
      "hit_rate",
      "mean_return",
    ].join(","),
  );
  for (const br of report.regimeBreakdowns) {
    for (const cell of br.byRegime) {
      lines.push(
        [
          csvEscape(br.component),
          csvEscape(REGIME_LABELS[cell.regime]),
          cell.sampleSize.toString(),
          fmtNum(cell.hitRate),
          fmtNum(cell.meanReturn),
        ].join(","),
      );
    }
  }
  lines.push("");

  // --- Sectie 3: decay-classificatie
  lines.push("# Sectie 3: decay-pattern per component");
  lines.push("component,decay_pattern,summary");
  for (const comp of report.components) {
    lines.push(
      [
        csvEscape(SIGNAL_COMPONENT_LABELS[comp.component]),
        csvEscape(comp.decayPattern),
        csvEscape(comp.summary),
      ].join(","),
    );
  }
  lines.push("");

  lines.push("# DISCLAIMER: " + report.disclaimer);
  return lines.join("\r\n") + "\r\n";
}

function fmtNum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "";
  return n.toFixed(4);
}

/**
 * RFC 4180 escape: wrap in quotes wanneer veld een komma, quote of
 * newline bevat; dubbel quotes binnen quotes.
 */
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
