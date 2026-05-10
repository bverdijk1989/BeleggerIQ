/**
 * Anonymizer — bouwt een gebucketeerde `ContributorPayload` uit de
 * `PortfolioView` van de gebruiker.
 *
 * **Principe**: alles wat individueel herleidbaar zou zijn (tickers,
 * exacte gewichten, exact rendement, exact yield), wordt gebucketeerd
 * of weggelaten. Wat overblijft is statistische schaduw — niet
 * portefeuille.
 *
 * Pure functie, deterministisch — kritisch voor tests en audit.
 */

import type { ISODateString } from "@/types/common";

import type { PortfolioView } from "../analytics/portfolio-view";
import { classifySector } from "../analytics/macro/regime";

import type { CommunityConsent } from "./types";
import type {
  Cohort,
  ContributorPayload,
  PerformanceBucket,
  YieldBucket,
} from "./types";

export interface BuildContributorPayloadInput {
  view: PortfolioView;
  cohort: Cohort;
  consent: CommunityConsent;
  /** Optioneel: YTD rendement-fractie van portfolio. Wanneer absent → geen perf-payload. */
  ytdReturnPct?: number | null;
  /** Optioneel: portfolio-weighted dividend-yield als fractie. */
  dividendYield?: number | null;
  asOf?: ISODateString;
}

/**
 * Bouwt de payload — schiet alle scopes weg waar de gebruiker geen opt-in
 * voor gegeven heeft. Wanneer er 0 scopes resteren, return je een lege
 * payload (caller hoort niets te uploaden).
 */
export function buildContributorPayload(
  input: BuildContributorPayloadInput,
): ContributorPayload {
  const asOf: ISODateString = input.asOf ?? new Date().toISOString();
  const payload: ContributorPayload = {
    cohort: input.cohort,
    asOf,
    scopes: {},
  };

  if (input.consent.scopes.includes("PORTFOLIO_ALLOCATION")) {
    payload.scopes.PORTFOLIO_ALLOCATION = buildAllocationBuckets(input.view);
  }
  if (input.consent.scopes.includes("RISK_PROFILE")) {
    payload.scopes.RISK_PROFILE = buildRiskBuckets(input.view);
  }
  if (input.consent.scopes.includes("DIVIDEND_STRATEGY")) {
    payload.scopes.DIVIDEND_STRATEGY = buildDividendBuckets(
      input.view,
      input.dividendYield ?? null,
    );
  }
  if (input.consent.scopes.includes("SECTOR_BENCHMARK")) {
    payload.scopes.SECTOR_BENCHMARK = buildSectorBuckets(input.view);
  }
  if (input.consent.scopes.includes("PERFORMANCE_BENCHMARK")) {
    payload.scopes.PERFORMANCE_BENCHMARK = buildPerformanceBuckets(
      input.ytdReturnPct ?? null,
    );
  }

  return payload;
}

// ============================================================
//  Per-scope bucket-builders
// ============================================================

function buildAllocationBuckets(view: PortfolioView): {
  equityPct: number;
  bondsPct: number;
  cashPct: number;
  altPct: number;
} {
  const slices = view.summary.allocationByAssetClass;
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) {
    return { equityPct: 0, bondsPct: 0, cashPct: 1, altPct: 0 };
  }
  let equity = 0;
  let bonds = 0;
  let cash = 0;
  let alt = 0;
  for (const slice of slices) {
    const cls = slice.label.toUpperCase();
    const w = slice.value / total;
    if (cls === "EQUITY" || cls === "ETF") equity += w;
    else if (cls === "BOND") bonds += w;
    else if (cls === "CASH") cash += w;
    else alt += w; // REIT / COMMODITY / CRYPTO / OTHER
  }
  return {
    equityPct: round01(equity),
    bondsPct: round01(bonds),
    cashPct: round01(cash),
    altPct: round01(alt),
  };
}

function buildRiskBuckets(view: PortfolioView): {
  beta: number;
  volatilityBucket: "low" | "medium" | "high";
  diversificationBucket: "low" | "medium" | "high";
} {
  // Beta wordt afgerond op 0.1 — geen unieke fingerprint per gebruiker.
  const rawBeta = view.risk.portfolioBeta ?? 1.0;
  const beta = Math.round(rawBeta * 10) / 10;

  const vol = view.risk.portfolioVolatility ?? 0.15;
  const volatilityBucket: "low" | "medium" | "high" =
    vol < 0.10 ? "low" : vol < 0.20 ? "medium" : "high";

  // HHI: lager = breder verdeeld. <0.10 = goed, <0.20 = matig.
  const hhi = view.risk.concentrationHhi ?? 0.15;
  const diversificationBucket: "low" | "medium" | "high" =
    hhi < 0.10 ? "high" : hhi < 0.20 ? "medium" : "low";

  return { beta, volatilityBucket, diversificationBucket };
}

function buildDividendBuckets(
  view: PortfolioView,
  yieldFraction: number | null,
): { yieldBucket: YieldBucket; payoutConcentration: "low" | "medium" | "high" } {
  const yld = (yieldFraction ?? 0) * 100;
  const yieldBucket: YieldBucket =
    yld < 1 ? "0-1%" : yld < 2 ? "1-2%" : yld < 4 ? "2-4%" : "4%+";

  // Payout-concentratie: top-3 weight als proxy. Hogere top-3 = hoger
  // afhankelijkheids-risico.
  const top3 = view.summary.topPositions.slice(0, 3);
  const top3Weight = top3.reduce((sum, p) => sum + p.weight, 0);
  const payoutConcentration: "low" | "medium" | "high" =
    top3Weight < 0.25 ? "low" : top3Weight < 0.45 ? "medium" : "high";

  return { yieldBucket, payoutConcentration };
}

function buildSectorBuckets(view: PortfolioView): { topSectors: ReadonlyArray<string> } {
  // Aggregate sector-weights via classifySector zodat we een schone
  // bucket-set hebben (geen bron-vrije-tekst lekt naar community).
  const weights = new Map<string, number>();
  const totalEquity = view.valuations.reduce((sum, v) => sum + v.marketValueBase, 0);
  if (totalEquity <= 0) return { topSectors: [] };
  for (const v of view.valuations) {
    const bucket = classifySector(v.holding.sector);
    if (bucket === "unknown") continue;
    const w = v.marketValueBase / totalEquity;
    weights.set(bucket, (weights.get(bucket) ?? 0) + w);
  }
  const topSectors = [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sector]) => sector);
  return { topSectors };
}

function buildPerformanceBuckets(
  ytdReturnPct: number | null,
): { ytdBucket: PerformanceBucket } {
  if (ytdReturnPct === null || !Number.isFinite(ytdReturnPct)) {
    return { ytdBucket: "0..+10%" };
  }
  const pct = ytdReturnPct * 100;
  const ytdBucket: PerformanceBucket =
    pct < -10 ? "<-10%" :
    pct < 0 ? "-10..0%" :
    pct < 10 ? "0..+10%" :
    pct < 25 ? "+10..+25%" :
    "+25%+";
  return { ytdBucket };
}

function round01(value: number): number {
  return Math.round(value * 100) / 100;
}
