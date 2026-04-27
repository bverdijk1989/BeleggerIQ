import type {
  AttributionBreakdown,
  BenchmarkPerformance,
  BenchmarkReport,
} from "./types";

/**
 * Engine-orkestrator: combineert performance + attribution tot één
 * `BenchmarkReport` met deterministische NL-verdict-zin.
 *
 * Pure functie — caller levert al-berekende performance + attribution.
 */

export interface BuildBenchmarkReportInput {
  performance: BenchmarkPerformance;
  attribution: AttributionBreakdown;
  /** Override `now` voor tests. */
  now?: string;
}

export function buildBenchmarkReport(
  input: BuildBenchmarkReportInput,
): BenchmarkReport {
  const generatedAt = input.now ?? new Date().toISOString();
  return {
    generatedAt,
    performance: input.performance,
    attribution: input.attribution,
    verdict: buildVerdict(input.performance, input.attribution),
  };
}

function buildVerdict(
  performance: BenchmarkPerformance,
  attribution: AttributionBreakdown,
): string {
  if (performance.monthsObserved === 0) {
    return `Onvoldoende data om ${performance.benchmark.label} mee te vergelijken.`;
  }
  const alphaPct = (performance.alpha * 100).toFixed(1);
  const direction =
    performance.alpha > 0.005
      ? "boven"
      : performance.alpha < -0.005
        ? "onder"
        : "in lijn met";
  const base = `Portefeuille presteert ${direction} ${performance.benchmark.label} (alpha ${alphaPct}%, tracking error ${(performance.trackingError * 100).toFixed(1)}%, ${performance.monthsObserved}m).`;

  // Top driver.
  const topSector = attribution.sectors[0];
  const bottomSector = attribution.sectors[attribution.sectors.length - 1];
  if (topSector && bottomSector && topSector !== bottomSector) {
    if (topSector.contribution > 0 && bottomSector.contribution < 0) {
      return `${base} Grootste positieve bijdrage: ${topSector.label} (+${(topSector.contribution * 100).toFixed(1)}%); grootste rem: ${bottomSector.label} (${(bottomSector.contribution * 100).toFixed(1)}%).`;
    }
    if (topSector.contribution > 0) {
      return `${base} Grootste positieve bijdrage: ${topSector.label} (+${(topSector.contribution * 100).toFixed(1)}%).`;
    }
  }
  return base;
}
