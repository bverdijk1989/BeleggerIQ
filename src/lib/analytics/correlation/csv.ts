/**
 * Correlation Studio — CSV exporter (Module 28).
 *
 * Bouwt een RFC 4180-compatibele CSV met 3 secties:
 *  1. Matrix (i,j,correlation,sample_size)
 *  2. Insights (kind,pair,correlation,rationale)
 *  3. Diversification verdict + disclaimer
 */

import type { CorrelationReport } from "./types";

export function buildCorrelationCsv(report: CorrelationReport): string {
  const lines: string[] = [];

  lines.push("# Cross-Asset Correlation Studio — gegenereerd " + report.generatedAt);
  lines.push("# Lookback: " + report.lookbackTradingDays + " trading days");
  lines.push("# Diversification score: " + report.diversificationScore + "/100 (" + report.diversificationVerdict + ")");
  if (report.warning) lines.push("# WAARSCHUWING: " + report.warning);
  lines.push("");

  // Sectie 1 — Matrix
  lines.push("# Sectie 1: correlation matrix (paarsgewijs, i<j)");
  lines.push("ticker_a,ticker_b,asset_a,asset_b,correlation,sample_size");
  for (const cell of report.cells) {
    const a = report.assets[cell.i];
    const b = report.assets[cell.j];
    if (!a || !b) continue;
    lines.push(
      [
        csvEscape(a.ticker),
        csvEscape(b.ticker),
        csvEscape(a.name),
        csvEscape(b.name),
        fmtNum(cell.correlation),
        cell.sampleSize.toString(),
      ].join(","),
    );
  }
  lines.push("");

  // Sectie 2 — Insights
  lines.push("# Sectie 2: top inzichten");
  lines.push("kind,ticker_a,ticker_b,pair_label,correlation,rationale");
  for (const ins of report.insights) {
    lines.push(
      [
        csvEscape(ins.kind),
        csvEscape(ins.tickerA),
        csvEscape(ins.tickerB),
        csvEscape(ins.pairLabel),
        fmtNum(ins.correlation),
        csvEscape(ins.rationale),
      ].join(","),
    );
  }
  lines.push("");

  // Sectie 3 — disclaimer
  lines.push("# DISCLAIMER: " + report.disclaimer);
  return lines.join("\r\n") + "\r\n";
}

function fmtNum(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "";
  return n.toFixed(4);
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}
