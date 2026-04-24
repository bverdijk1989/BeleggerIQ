import type { InstrumentClassification } from "@/lib/analytics/instruments";
import type { Holding } from "@/types/portfolio";

import { classifyInstrumentRisk } from "./classify-risk";
import { resolvePositionLimitByAssetType } from "./position-limits";
import type {
  PolicyContext,
  PolicyReport,
  PolicyViolation,
  ViolationSeverity,
} from "./types";

/**
 * Scan een portefeuille op policy-overschrijdingen.
 *
 * Input: lijst holdings (+ marketValueBase per holding) en de bijbehorende
 * classificaties. Output: per-positie `PolicyViolation` + portfolio-brede
 * tellers.
 *
 * Severity-ladder (relatief aan de cap, niet absoluut):
 *   - `ok`:       current ≤ cap
 *   - `minor`:    cap < current ≤ 1.25 × cap
 *   - `major`:    1.25 × cap < current ≤ 2 × cap
 *   - `critical`: > 2 × cap
 *
 * Deze drempels zijn bewust *relatief*: een 30% sector-ETF-positie is
 * major (cap 15%), een 12% single stock is ook major (cap 10%, ratio
 * 1.2× — net boven minor). Beide vragen om rebalance-actie.
 */

export interface DetectPolicyViolationsInput {
  holdings: Array<{
    holding: Pick<
      Holding,
      "id" | "ticker" | "volatility"
    >;
    marketValueBase: number;
    classification: InstrumentClassification;
  }>;
  totalValue: number;
  context?: PolicyContext;
}

export function detectPolicyViolations(
  input: DetectPolicyViolationsInput,
): PolicyReport {
  const { holdings, totalValue, context } = input;
  const assessedAt = new Date().toISOString();
  const safeTotal = Number.isFinite(totalValue) && totalValue > 0 ? totalValue : 0;

  const violations: PolicyViolation[] = holdings.map((row) => {
    const weight = safeTotal > 0 ? row.marketValueBase / safeTotal : 0;

    const risk = classifyInstrumentRisk({
      holding: row.holding,
      classification: row.classification,
    });

    const limit = resolvePositionLimitByAssetType({
      classification: row.classification,
      risk,
      context,
    });

    const { allowedMaxWeight } = limit;
    const excessWeight = weight > allowedMaxWeight ? weight - allowedMaxWeight : 0;
    const severity = computeSeverity(weight, allowedMaxWeight);

    const notes: string[] = [...risk.rationale];
    notes.push(limit.reason);

    return {
      holdingId: row.holding.id,
      ticker: row.holding.ticker,
      instrumentType: row.classification.instrumentType,
      currentWeight: roundTo4(weight),
      allowedMaxWeight:
        allowedMaxWeight === Number.POSITIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : roundTo4(allowedMaxWeight),
      excessWeight: roundTo4(excessWeight),
      violationSeverity: severity,
      policyReason: buildPolicyReason(severity, weight, allowedMaxWeight, limit.reason),
      riskLevel: risk.level,
      notes,
    };
  });

  const counts: Record<ViolationSeverity, number> = {
    ok: 0,
    minor: 0,
    major: 0,
    critical: 0,
  };
  for (const v of violations) counts[v.violationSeverity] += 1;

  const overallSeverity: ViolationSeverity =
    counts.critical > 0
      ? "critical"
      : counts.major > 0
        ? "major"
        : counts.minor > 0
          ? "minor"
          : "ok";

  return {
    totalValue: safeTotal,
    assessedAt,
    violations,
    counts,
    overallSeverity,
  };
}

// ============================================================
//  Severity-berekening (pure)
// ============================================================

function computeSeverity(weight: number, cap: number): ViolationSeverity {
  if (!Number.isFinite(cap) || cap <= 0) return "ok"; // geen cap
  if (weight <= cap) return "ok";
  const ratio = weight / cap;
  if (ratio <= 1.25) return "minor";
  if (ratio <= 2.0) return "major";
  return "critical";
}

function buildPolicyReason(
  severity: ViolationSeverity,
  weight: number,
  cap: number,
  basisReason: string,
): string {
  if (severity === "ok") return basisReason;
  if (!Number.isFinite(cap)) return basisReason;
  const overCapPct = Math.round((weight - cap) * 100 * 10) / 10; // 1 decimaal
  const severityLabel = {
    minor: "licht boven cap",
    major: "fors boven cap",
    critical: "kritisch boven cap",
  }[severity];
  return `${severityLabel}: ${overCapPct}%pt over. ${basisReason}`;
}

function roundTo4(value: number): number {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 10_000) / 10_000;
}
