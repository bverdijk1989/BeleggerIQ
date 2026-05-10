/**
 * Behavioral Engine — orchestrator.
 *
 * Pipeline:
 *  1. Run alle 8 detectoren over `BehavioralDetectorInput`.
 *  2. Verzamel signalen + skip-reasons.
 *  3. Sorteer signalen op severity desc, daarna stabiel op `id`.
 *  4. Tellingen per severity voor dashboard-stats.
 *
 * **Pure functie**: zelfde input → identieke output. Geen I/O.
 */

import { ALL_DETECTORS } from "./detectors";
import type { BehavioralDetectorInput } from "./detector-types";
import type {
  BehavioralReport,
  BehavioralSeverity,
  BehavioralSignal,
} from "./types";
import { BEHAVIORAL_SEVERITY_RANK } from "./types";

export function runBehavioralEngine(
  input: BehavioralDetectorInput,
): BehavioralReport {
  const allSignals: BehavioralSignal[] = [];
  const skipped: BehavioralReport["skippedDetectors"] = [];

  for (const { key, detect } of ALL_DETECTORS) {
    const result = detect(input);
    for (const signal of result.signals) {
      allSignals.push(signal);
    }
    if (result.skipReason) {
      skipped.push({ key, reason: result.skipReason });
    }
  }

  // Dedupe op id (defensief — id's moeten al uniek zijn per detector).
  const byId = new Map<string, BehavioralSignal>();
  for (const s of allSignals) {
    const existing = byId.get(s.id);
    if (!existing || severityRank(s.severity) > severityRank(existing.severity)) {
      byId.set(s.id, s);
    }
  }
  const dedup = [...byId.values()];

  // Stabiele sort: severity desc, dan id asc.
  dedup.sort((a, b) => {
    const diff = severityRank(b.severity) - severityRank(a.severity);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  const counts: Record<BehavioralSeverity, number> = {
    low: 0,
    moderate: 0,
    elevated: 0,
    high: 0,
  };
  for (const s of dedup) counts[s.severity] += 1;

  return {
    portfolioId: input.portfolioId,
    detectedAt: input.asOf,
    signals: dedup,
    counts,
    skippedDetectors: skipped,
  };
}

function severityRank(s: BehavioralSeverity): number {
  return BEHAVIORAL_SEVERITY_RANK[s];
}
