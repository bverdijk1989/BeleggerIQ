/**
 * Cohort-builder: leid de coarse-grained bucket-key af uit user-state.
 *
 * **Bewust grof**: alleen 4 leeftijds-, 4 risico- en 4 grootte-buckets =
 * 64 cohorts max. Hoe groter een bucket, hoe makkelijker we
 * k-anonimiteit halen. Te fijn → veel cohorts beneden K → veel
 * synthetic-baseline-fallback.
 */

import type {
  AgeBucket,
  Cohort,
  CohortKey,
  RiskBucket,
  SizeBucket,
} from "./types";

export function ageToBucket(age: number | null | undefined): AgeBucket {
  if (typeof age !== "number" || !Number.isFinite(age)) return "30-45";
  if (age < 30) return "<30";
  if (age < 45) return "30-45";
  if (age < 60) return "45-60";
  return "60+";
}

export function sizeToBucket(totalValue: number | null | undefined): SizeBucket {
  if (typeof totalValue !== "number" || !Number.isFinite(totalValue) || totalValue < 0) {
    return "10-50k";
  }
  if (totalValue < 10_000) return "<10k";
  if (totalValue < 50_000) return "10-50k";
  if (totalValue < 200_000) return "50-200k";
  return "200k+";
}

/**
 * Map van vrije-tekst risicoprofiel-string naar bucket. Tolerant:
 * onbekende waarden → balanced.
 */
export function riskProfileToBucket(profile: string | null | undefined): RiskBucket {
  if (!profile) return "balanced";
  const p = profile.toLowerCase();
  if (p.includes("conserv") || p.includes("defen")) return "conservative";
  if (p.includes("aggress") || p.includes("offens")) return "aggressive";
  if (p.includes("growth") || p.includes("groei")) return "growth";
  return "balanced";
}

export function buildCohortKey(
  age: AgeBucket,
  risk: RiskBucket,
  size: SizeBucket,
): CohortKey {
  return `${age}|${risk}|${size}`;
}

export interface BuildCohortInput {
  age?: number | null;
  riskProfile?: string | null;
  totalValue?: number | null;
}

export function buildCohort(input: BuildCohortInput): Cohort {
  const age = ageToBucket(input.age);
  const risk = riskProfileToBucket(input.riskProfile);
  const size = sizeToBucket(input.totalValue);
  return { age, risk, size, key: buildCohortKey(age, risk, size) };
}
