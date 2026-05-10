/**
 * Benchmark-engine: vergelijk een `ContributorPayload` tegen de cohort-
 * aggregate (real OR synthetic-baseline) en produceer per-scope
 * `BenchmarkComparison`-objecten.
 *
 * Pure functie, geen I/O. Output is deterministisch — twee identieke
 * inputs leveren altijd identieke output.
 *
 * **Topbelegger-laag**:
 *  - Buffett: verdict in spreektaal, geen alarm-cues.
 *  - Dalio: tonen waar je AFWIJKT, niet waar je beter scoort.
 *  - Lynch: verdict-zin staat los van %-stack — leesbaar zonder grafiek.
 *  - Simons: drempels in const, deterministisch, klein # branches.
 */

import type { ISODateString } from "@/types/common";

import { buildSyntheticBaseline } from "./baselines";
import {
  CONSENT_SCOPE_LABELS,
  COMMUNITY_PRIVACY_NOTICE,
  K_ANONYMITY_THRESHOLD,
  type BenchmarkComparison,
  type CommunityAggregate,
  type CommunityBenchmarkReport,
  type ConsentScope,
  type ContributorPayload,
  type PerformanceBucket,
  type YieldBucket,
} from "./types";

export interface BuildBenchmarkInput {
  payload: ContributorPayload;
  /** Optioneel: cohort-aggregate uit DB. Wanneer null/undefined OF sampleSize<K, vallen we terug op synthetic-baseline. */
  cohortAggregate?: CommunityAggregate | null;
  asOf?: ISODateString;
}

export function buildCommunityBenchmark(
  input: BuildBenchmarkInput,
): CommunityBenchmarkReport {
  const cohort = input.payload.cohort;
  const aggregate = pickAggregate(input.cohortAggregate, cohort);
  const generatedAt = input.asOf ?? new Date().toISOString();

  const comparisons: BenchmarkComparison[] = [];
  const scopes = input.payload.scopes;

  if (scopes.PORTFOLIO_ALLOCATION && aggregate.scopes.PORTFOLIO_ALLOCATION) {
    comparisons.push(
      compareAllocation(scopes.PORTFOLIO_ALLOCATION, aggregate),
    );
  }
  if (scopes.RISK_PROFILE && aggregate.scopes.RISK_PROFILE) {
    comparisons.push(compareRiskProfile(scopes.RISK_PROFILE, aggregate));
  }
  if (scopes.DIVIDEND_STRATEGY && aggregate.scopes.DIVIDEND_STRATEGY) {
    comparisons.push(compareDividend(scopes.DIVIDEND_STRATEGY, aggregate));
  }
  if (scopes.SECTOR_BENCHMARK && aggregate.scopes.SECTOR_BENCHMARK) {
    comparisons.push(compareSectors(scopes.SECTOR_BENCHMARK, aggregate));
  }
  if (scopes.PERFORMANCE_BENCHMARK && aggregate.scopes.PERFORMANCE_BENCHMARK) {
    comparisons.push(comparePerformance(scopes.PERFORMANCE_BENCHMARK, aggregate));
  }

  const activeScopes: ConsentScope[] = comparisons.map((c) => c.scope);

  const attentionPoint =
    [...comparisons].sort((a, b) => attentionRank(b) - attentionRank(a))[0] ?? null;

  return {
    generatedAt,
    cohort,
    activeScopes,
    comparisons,
    privacyNotice: COMMUNITY_PRIVACY_NOTICE,
    attentionPoint,
  };
}

/**
 * Selecteert de geldige aggregate. Wanneer cohort-aggregate sample-size
 * onder K_ANONYMITY_THRESHOLD valt, val terug op synthetische baseline
 * — geen privacy-leak, geen lawine van micro-cohort-rondzendingen.
 */
function pickAggregate(
  candidate: CommunityAggregate | null | undefined,
  cohort: ContributorPayload["cohort"],
): CommunityAggregate {
  if (
    candidate &&
    candidate.source === "real" &&
    candidate.sampleSize >= K_ANONYMITY_THRESHOLD
  ) {
    return candidate;
  }
  return buildSyntheticBaseline(cohort);
}

// ============================================================
//  Per-scope vergelijkingen
// ============================================================

function compareAllocation(
  user: NonNullable<ContributorPayload["scopes"]["PORTFOLIO_ALLOCATION"]>,
  aggregate: CommunityAggregate,
): BenchmarkComparison {
  const ref = aggregate.scopes.PORTFOLIO_ALLOCATION!;
  const equityDelta = user.equityPct - ref.equityPct.p50;
  const cashDelta = user.cashPct - ref.cashPct.p50;
  const bondsDelta = user.bondsPct - ref.bondsPct.p50;

  // Percentile op equity-pct binnen p25-p75 band — coarse-mapping:
  const percentile = bandPercentile(user.equityPct, ref.equityPct);

  let tone: BenchmarkComparison["tone"] = "neutral";
  let verdict: string;
  if (Math.abs(equityDelta) < 0.05) {
    verdict = "Je asset-mix ligt in lijn met je cohort.";
  } else if (equityDelta > 0.10) {
    tone = "attention";
    verdict = `Je hebt fors meer equity dan typisch (+${pct(equityDelta)}). Hogere groei-potentie, maar ook scherpere drawdown-risico's.`;
  } else if (equityDelta < -0.10) {
    tone = "attention";
    verdict = `Je hebt fors minder equity dan typisch (${pct(equityDelta)}). Stabieler, maar mogelijk te defensief voor je horizon.`;
  } else {
    verdict = `Je equity-aandeel wijkt licht af van het cohort (${pct(equityDelta, true)}).`;
  }

  const details = [
    `Jij: ${pct(user.equityPct)} equity / ${pct(user.bondsPct)} bonds / ${pct(user.cashPct)} cash`,
    `Cohort mediaan: ${pct(ref.equityPct.p50)} equity / ${pct(ref.bondsPct.p50)} bonds / ${pct(ref.cashPct.p50)} cash`,
    `Cash-delta vs cohort: ${pct(cashDelta, true)} · Bond-delta: ${pct(bondsDelta, true)}`,
  ];

  return {
    scope: "PORTFOLIO_ALLOCATION",
    label: CONSENT_SCOPE_LABELS.PORTFOLIO_ALLOCATION,
    sampleSize: aggregate.sampleSize,
    source: aggregate.source,
    verdict,
    percentile,
    details,
    tone,
  };
}

function compareRiskProfile(
  user: NonNullable<ContributorPayload["scopes"]["RISK_PROFILE"]>,
  aggregate: CommunityAggregate,
): BenchmarkComparison {
  const ref = aggregate.scopes.RISK_PROFILE!;
  const betaDelta = user.beta - ref.beta.p50;
  const percentile = bandPercentile(user.beta, ref.beta);

  let tone: BenchmarkComparison["tone"] = "neutral";
  let verdict: string;
  if (Math.abs(betaDelta) < 0.10) {
    verdict = "Je risicoprofiel zit dicht bij het cohort-midden.";
  } else if (betaDelta > 0.20) {
    tone = "attention";
    verdict = `Je beta is hoger dan typisch (+${betaDelta.toFixed(2)}) — je beweegt sterker met de markt mee.`;
  } else if (betaDelta < -0.20) {
    tone = "positive";
    verdict = `Je beta ligt onder het cohort (${betaDelta.toFixed(2)}) — defensiever opgesteld dan gemiddeld.`;
  } else {
    verdict = `Je beta wijkt licht af (${betaDelta >= 0 ? "+" : ""}${betaDelta.toFixed(2)}).`;
  }

  const userVolLabel =
    user.volatilityBucket === "low"
      ? "lage"
      : user.volatilityBucket === "medium"
        ? "gemiddelde"
        : "hoge";

  const details = [
    `Jij: beta ${user.beta.toFixed(2)}, ${userVolLabel} volatility, diversificatie ${user.diversificationBucket}`,
    `Cohort beta: p25 ${ref.beta.p25.toFixed(2)} / p50 ${ref.beta.p50.toFixed(2)} / p75 ${ref.beta.p75.toFixed(2)}`,
    `Diversificatie-spread cohort: ${pctMap(ref.diversificationDistribution)}`,
  ];

  return {
    scope: "RISK_PROFILE",
    label: CONSENT_SCOPE_LABELS.RISK_PROFILE,
    sampleSize: aggregate.sampleSize,
    source: aggregate.source,
    verdict,
    percentile,
    details,
    tone,
  };
}

function compareDividend(
  user: NonNullable<ContributorPayload["scopes"]["DIVIDEND_STRATEGY"]>,
  aggregate: CommunityAggregate,
): BenchmarkComparison {
  const ref = aggregate.scopes.DIVIDEND_STRATEGY!;
  const yieldFreq = ref.yieldDistribution[user.yieldBucket] ?? 0;
  // percentile als positie op de yield-ladder:
  const ladder: ReadonlyArray<YieldBucket> = ["0-1%", "1-2%", "2-4%", "4%+"];
  const ladderIdx = ladder.indexOf(user.yieldBucket);
  const percentile = ladderIdx >= 0 ? Math.round(((ladderIdx + 0.5) / ladder.length) * 100) : null;

  let tone: BenchmarkComparison["tone"] = "neutral";
  let verdict: string;
  if (yieldFreq >= 0.30) {
    verdict = `Je yield-bracket (${user.yieldBucket}) is een veelvoorkomende keuze in je cohort.`;
  } else if (user.yieldBucket === "4%+") {
    tone = "attention";
    verdict = "Hoge-yield strategie — vaak met meer cyclisch- of REIT-risico. Check of de payout-historie consistent is.";
  } else if (user.yieldBucket === "0-1%") {
    verdict = "Je hebt een groei-georiënteerde portefeuille — dividend speelt nauwelijks een rol.";
  } else {
    verdict = `Je yield-bracket (${user.yieldBucket}) is minder gangbaar in je cohort (${pct(yieldFreq)}).`;
  }
  if (user.payoutConcentration === "high") {
    tone = "attention";
    verdict += " Payout zit sterk geconcentreerd in je top-3 posities.";
  }

  const details = [
    `Jouw yield-bracket: ${user.yieldBucket} · payout-concentratie: ${user.payoutConcentration}`,
    `Cohort yield-spread: ${pctMap(ref.yieldDistribution)}`,
    `Cohort concentratie: ${pctMap(ref.payoutConcentrationDistribution)}`,
  ];

  return {
    scope: "DIVIDEND_STRATEGY",
    label: CONSENT_SCOPE_LABELS.DIVIDEND_STRATEGY,
    sampleSize: aggregate.sampleSize,
    source: aggregate.source,
    verdict,
    percentile,
    details,
    tone,
  };
}

function compareSectors(
  user: NonNullable<ContributorPayload["scopes"]["SECTOR_BENCHMARK"]>,
  aggregate: CommunityAggregate,
): BenchmarkComparison {
  const ref = aggregate.scopes.SECTOR_BENCHMARK!;
  const popular = Object.entries(ref.sectorPopularity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([s]) => s);
  const overlap = user.topSectors.filter((s) => popular.includes(s)).length;
  const percentile = user.topSectors.length === 0 ? null : Math.round((overlap / user.topSectors.length) * 100);

  let tone: BenchmarkComparison["tone"] = "neutral";
  let verdict: string;
  if (user.topSectors.length === 0) {
    verdict = "Sector-data ontbreekt — kunnen geen sector-vergelijking maken.";
  } else if (overlap === user.topSectors.length) {
    verdict = `Je top-sectoren overlappen volledig met de populairste cohort-sectoren — geen sector-tilt.`;
  } else if (overlap === 0) {
    tone = "attention";
    verdict = `Je top-sectoren wijken sterk af van het cohort — bewuste keuze of toeval?`;
  } else {
    verdict = `Je hebt ${overlap}/${user.topSectors.length} sectoren gemeen met de cohort-top.`;
  }

  const details = [
    `Jouw top-3: ${user.topSectors.length ? user.topSectors.join(", ") : "—"}`,
    `Cohort top-5: ${popular.join(", ")}`,
    `Overlap: ${overlap}/${user.topSectors.length || 0}`,
  ];

  return {
    scope: "SECTOR_BENCHMARK",
    label: CONSENT_SCOPE_LABELS.SECTOR_BENCHMARK,
    sampleSize: aggregate.sampleSize,
    source: aggregate.source,
    verdict,
    percentile,
    details,
    tone,
  };
}

function comparePerformance(
  user: NonNullable<ContributorPayload["scopes"]["PERFORMANCE_BENCHMARK"]>,
  aggregate: CommunityAggregate,
): BenchmarkComparison {
  const ref = aggregate.scopes.PERFORMANCE_BENCHMARK!;
  const ladder: ReadonlyArray<PerformanceBucket> = [
    "<-10%",
    "-10..0%",
    "0..+10%",
    "+10..+25%",
    "+25%+",
  ];
  const idx = ladder.indexOf(user.ytdBucket);
  const percentile = idx >= 0 ? Math.round(((idx + 0.5) / ladder.length) * 100) : null;
  const yourFreq = ref.ytdDistribution[user.ytdBucket] ?? 0;

  let tone: BenchmarkComparison["tone"] = "neutral";
  let verdict: string;
  if (user.ytdBucket === "<-10%") {
    tone = "attention";
    verdict = "Sterke drawdown YTD — Buffett-laag: focus op kwaliteit en cash-flow, niet op terugverdienen via meer risico.";
  } else if (user.ytdBucket === "+25%+") {
    verdict = "Excellente YTD — let op: hoge winsten kunnen overconfidence triggeren (gedrags-risico).";
  } else if (yourFreq >= 0.35) {
    verdict = `Jouw rendement-bracket (${user.ytdBucket}) is de mediaan-uitkomst in je cohort.`;
  } else {
    verdict = `Rendement-bracket: ${user.ytdBucket}. Wijkt licht af van het cohort-midden.`;
  }

  const details = [
    `Jouw YTD-bracket: ${user.ytdBucket}`,
    `Cohort spread: ${pctMap(ref.ytdDistribution)}`,
  ];

  return {
    scope: "PERFORMANCE_BENCHMARK",
    label: CONSENT_SCOPE_LABELS.PERFORMANCE_BENCHMARK,
    sampleSize: aggregate.sampleSize,
    source: aggregate.source,
    verdict,
    percentile,
    details,
    tone,
  };
}

// ============================================================
//  Helpers
// ============================================================

function bandPercentile(
  value: number,
  band: { p25: number; p50: number; p75: number },
): number {
  if (value <= band.p25) return Math.max(0, Math.round(25 * (value / Math.max(band.p25, 0.0001))));
  if (value <= band.p50) {
    const ratio = (value - band.p25) / Math.max(band.p50 - band.p25, 0.0001);
    return Math.round(25 + ratio * 25);
  }
  if (value <= band.p75) {
    const ratio = (value - band.p50) / Math.max(band.p75 - band.p50, 0.0001);
    return Math.round(50 + ratio * 25);
  }
  // Boven p75: clamp tot 99.
  const overshoot = (value - band.p75) / Math.max(band.p75, 0.0001);
  return Math.min(99, 75 + Math.round(overshoot * 24));
}

function pct(value: number, signed = false): string {
  const v = (value * 100).toFixed(0);
  if (signed && value > 0) return `+${v}%`;
  if (signed && value < 0) return `${v}%`;
  return `${v}%`;
}

function pctMap(dist: Record<string, number>): string {
  return Object.entries(dist)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}: ${Math.round(v * 100)}%`)
    .join(" · ");
}

function attentionRank(c: BenchmarkComparison): number {
  if (c.tone === "attention") return 2;
  if (c.tone === "positive") return 1;
  return 0;
}
