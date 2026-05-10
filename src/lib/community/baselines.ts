/**
 * Synthetische baseline-aggregaten — geijkt op publieke
 * beleggersliteratuur (typische Nederlandse retail-beleggersprofielen).
 *
 * **Waarom**: zolang een cohort < K_ANONYMITY_THRESHOLD opt-ins heeft,
 * tonen we GEEN cohort-aggregate. Maar de gebruiker wil wel direct
 * iets zien. Daarom hebben we een synthetische baseline — expliciet
 * gelabeld als zodanig in de UI, niet vermomd als "echte data".
 *
 * Deze baselines zijn **niet** voorspellingen of beleggings-advies. Ze
 * zijn referentie-waardes die helpen "ben ik anders dan typisch?".
 */

import type {
  AgeBucket,
  CommunityAggregate,
  Cohort,
  RiskBucket,
  SizeBucket,
} from "./types";
import { buildCohortKey } from "./cohort";

// ============================================================
//  Risk-profile → asset-class mix (typische beleggersliteratuur)
// ============================================================

const ALLOCATION_BY_RISK: Record<
  RiskBucket,
  {
    equityPct: { p25: number; p50: number; p75: number };
    bondsPct: { p25: number; p50: number; p75: number };
    cashPct: { p25: number; p50: number; p75: number };
    altPct: { p25: number; p50: number; p75: number };
  }
> = {
  conservative: {
    equityPct: { p25: 0.25, p50: 0.35, p75: 0.45 },
    bondsPct: { p25: 0.35, p50: 0.45, p75: 0.55 },
    cashPct: { p25: 0.05, p50: 0.10, p75: 0.20 },
    altPct: { p25: 0.0, p50: 0.05, p75: 0.10 },
  },
  balanced: {
    equityPct: { p25: 0.45, p50: 0.55, p75: 0.65 },
    bondsPct: { p25: 0.20, p50: 0.30, p75: 0.40 },
    cashPct: { p25: 0.05, p50: 0.10, p75: 0.15 },
    altPct: { p25: 0.0, p50: 0.05, p75: 0.10 },
  },
  growth: {
    equityPct: { p25: 0.65, p50: 0.75, p75: 0.85 },
    bondsPct: { p25: 0.05, p50: 0.15, p75: 0.25 },
    cashPct: { p25: 0.03, p50: 0.07, p75: 0.12 },
    altPct: { p25: 0.0, p50: 0.05, p75: 0.10 },
  },
  aggressive: {
    equityPct: { p25: 0.80, p50: 0.88, p75: 0.95 },
    bondsPct: { p25: 0.0, p50: 0.05, p75: 0.10 },
    cashPct: { p25: 0.02, p50: 0.05, p75: 0.10 },
    altPct: { p25: 0.0, p50: 0.05, p75: 0.15 },
  },
};

const RISK_PROFILE_BY_RISK: Record<
  RiskBucket,
  {
    beta: { p25: number; p50: number; p75: number };
    volatilityDistribution: { low: number; medium: number; high: number };
    diversificationDistribution: { low: number; medium: number; high: number };
  }
> = {
  conservative: {
    beta: { p25: 0.4, p50: 0.6, p75: 0.8 },
    volatilityDistribution: { low: 0.55, medium: 0.35, high: 0.10 },
    diversificationDistribution: { low: 0.10, medium: 0.50, high: 0.40 },
  },
  balanced: {
    beta: { p25: 0.7, p50: 0.9, p75: 1.05 },
    volatilityDistribution: { low: 0.20, medium: 0.55, high: 0.25 },
    diversificationDistribution: { low: 0.15, medium: 0.55, high: 0.30 },
  },
  growth: {
    beta: { p25: 0.95, p50: 1.10, p75: 1.25 },
    volatilityDistribution: { low: 0.05, medium: 0.35, high: 0.60 },
    diversificationDistribution: { low: 0.25, medium: 0.50, high: 0.25 },
  },
  aggressive: {
    beta: { p25: 1.10, p50: 1.30, p75: 1.50 },
    volatilityDistribution: { low: 0.02, medium: 0.20, high: 0.78 },
    diversificationDistribution: { low: 0.45, medium: 0.40, high: 0.15 },
  },
};

const DIVIDEND_BY_RISK: Record<
  RiskBucket,
  {
    yieldDistribution: { "0-1%": number; "1-2%": number; "2-4%": number; "4%+": number };
    payoutConcentrationDistribution: { low: number; medium: number; high: number };
  }
> = {
  conservative: {
    yieldDistribution: { "0-1%": 0.05, "1-2%": 0.20, "2-4%": 0.55, "4%+": 0.20 },
    payoutConcentrationDistribution: { low: 0.45, medium: 0.40, high: 0.15 },
  },
  balanced: {
    yieldDistribution: { "0-1%": 0.15, "1-2%": 0.35, "2-4%": 0.40, "4%+": 0.10 },
    payoutConcentrationDistribution: { low: 0.35, medium: 0.45, high: 0.20 },
  },
  growth: {
    yieldDistribution: { "0-1%": 0.45, "1-2%": 0.35, "2-4%": 0.15, "4%+": 0.05 },
    payoutConcentrationDistribution: { low: 0.30, medium: 0.45, high: 0.25 },
  },
  aggressive: {
    yieldDistribution: { "0-1%": 0.65, "1-2%": 0.20, "2-4%": 0.10, "4%+": 0.05 },
    payoutConcentrationDistribution: { low: 0.25, medium: 0.40, high: 0.35 },
  },
};

// Sector-popularity is min-or-meer gelijk over risico-buckets — alle
// retail-beleggers hebben tech in de top, ongeacht profiel.
const SECTOR_POPULARITY_BASELINE: Record<string, number> = {
  tech: 0.62,
  healthcare: 0.38,
  financials: 0.32,
  "consumer-staples": 0.28,
  "consumer-discretionary": 0.24,
  industrials: 0.21,
  energy: 0.18,
  communication: 0.17,
  utilities: 0.12,
  "real-estate": 0.10,
  materials: 0.08,
};

const PERFORMANCE_BY_AGE_AND_RISK: Record<
  RiskBucket,
  Record<"<-10%" | "-10..0%" | "0..+10%" | "+10..+25%" | "+25%+", number>
> = {
  conservative: { "<-10%": 0.05, "-10..0%": 0.20, "0..+10%": 0.55, "+10..+25%": 0.18, "+25%+": 0.02 },
  balanced: { "<-10%": 0.07, "-10..0%": 0.18, "0..+10%": 0.45, "+10..+25%": 0.25, "+25%+": 0.05 },
  growth: { "<-10%": 0.10, "-10..0%": 0.18, "0..+10%": 0.32, "+10..+25%": 0.30, "+25%+": 0.10 },
  aggressive: { "<-10%": 0.15, "-10..0%": 0.20, "0..+10%": 0.25, "+10..+25%": 0.25, "+25%+": 0.15 },
};

// ============================================================
//  Builder
// ============================================================

/**
 * Bouwt een synthetische `CommunityAggregate` voor een willekeurige
 * cohort. Sample-size is altijd 0 (label-honest: "synthetic-baseline").
 */
export function buildSyntheticBaseline(cohort: Cohort): CommunityAggregate {
  return {
    cohort,
    sampleSize: 0,
    computedAt: "1970-01-01T00:00:00.000Z", // statische data
    source: "synthetic-baseline",
    scopes: {
      PORTFOLIO_ALLOCATION: ALLOCATION_BY_RISK[cohort.risk],
      RISK_PROFILE: RISK_PROFILE_BY_RISK[cohort.risk],
      DIVIDEND_STRATEGY: DIVIDEND_BY_RISK[cohort.risk],
      SECTOR_BENCHMARK: { sectorPopularity: { ...SECTOR_POPULARITY_BASELINE } },
      PERFORMANCE_BENCHMARK: { ytdDistribution: PERFORMANCE_BY_AGE_AND_RISK[cohort.risk] },
    },
  };
}

/**
 * Helper voor tests/bootstrap: alle 64 cohorts.
 */
export function listAllCohorts(): ReadonlyArray<Cohort> {
  const ages: ReadonlyArray<AgeBucket> = ["<30", "30-45", "45-60", "60+"];
  const risks: ReadonlyArray<RiskBucket> = [
    "conservative",
    "balanced",
    "growth",
    "aggressive",
  ];
  const sizes: ReadonlyArray<SizeBucket> = ["<10k", "10-50k", "50-200k", "200k+"];
  const out: Cohort[] = [];
  for (const age of ages) {
    for (const risk of risks) {
      for (const size of sizes) {
        out.push({ age, risk, size, key: buildCohortKey(age, risk, size) });
      }
    }
  }
  return out;
}
