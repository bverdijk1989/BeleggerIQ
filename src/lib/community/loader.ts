/**
 * Server-side loader: bouwt het Community Benchmark-rapport voor de
 * primaire portefeuille van de ingelogde user.
 *
 * **Privacy-belofte**: deze loader contribueert NIETS aan de community-
 * aggregates. Het is alleen lees-pad: we bouwen lokaal de payload én
 * vergelijken 'em tegen synthetische baseline. Persistente upload
 * gebeurt pas via een (toekomstige) aggregator-job en alleen voor
 * scopes waar de user opt-in heeft.
 */

import type { ISODateString } from "@/types/common";

import { buildPortfolioView } from "../analytics/portfolio-view";

import { buildContributorPayload } from "./anonymizer";
import { buildCommunityBenchmark } from "./benchmark";
import { buildCohort } from "./cohort";
import { parseCommunityConsent } from "./consent";
import type { CommunityBenchmarkReport, CommunityConsent } from "./types";

import { portfolioRepository } from "@/lib/data";
import { prisma } from "@/lib/data/prisma";

export interface LoadCommunityBenchmarkInput {
  userEmail: string;
  asOf?: ISODateString;
}

export interface LoadCommunityBenchmarkResult {
  report: CommunityBenchmarkReport | null;
  consent: CommunityConsent;
  noPortfolio: boolean;
  /** Geen opt-in op enige scope → toon alleen consent-flow. */
  notContributing: boolean;
}

export async function loadCommunityBenchmark(
  input: LoadCommunityBenchmarkInput,
): Promise<LoadCommunityBenchmarkResult> {
  const ctx = await portfolioRepository
    .findUserContextByEmail(input.userEmail)
    .catch(() => null);
  if (!ctx?.userId) {
    return {
      report: null,
      consent: { scopes: [], updatedAt: null, consentTextVersion: 0 },
      noPortfolio: true,
      notContributing: true,
    };
  }

  // Lees consent + risk-profile uit UserProfile in 1 call.
  const profile = await prisma.userProfile
    .findUnique({
      where: { userId: ctx.userId },
      select: { preferences: true, riskTolerance: true },
    })
    .catch(() => null);

  const prefsObj =
    profile?.preferences && typeof profile.preferences === "object"
      ? (profile.preferences as Record<string, unknown>)
      : {};
  const consent = parseCommunityConsent(prefsObj.community);

  if (consent.scopes.length === 0) {
    // Geen opt-in → geen vergelijking. UI moet de consent-flow tonen.
    return {
      report: null,
      consent,
      noPortfolio: false,
      notContributing: true,
    };
  }

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(input.userEmail)
    .catch(() => null);
  if (!portfolio) {
    return { report: null, consent, noPortfolio: true, notContributing: false };
  }

  // Fundamentals zijn alleen nodig wanneer DIVIDEND_STRATEGY is opt-in,
  // maar we includeren 'em ook bij PERFORMANCE_BENCHMARK voor scherpere
  // YTD-data. Voor PORTFOLIO_ALLOCATION + RISK + SECTOR is het overbodig.
  const needsFundamentals =
    consent.scopes.includes("DIVIDEND_STRATEGY");

  const view = await buildPortfolioView(portfolio, {
    includeFundamentals: needsFundamentals,
    includeFactorScores: false,
  }).catch(() => null);
  if (!view) {
    return { report: null, consent, noPortfolio: true, notContributing: false };
  }

  const cohort = buildCohort({
    age: null, // geen birth-year-veld in v1; valt terug op default-bucket
    riskProfile: profile?.riskTolerance ?? null,
    totalValue: view.summary.totalValue,
  });

  const ytdReturnPct =
    view.summary.totalCost > 0
      ? view.summary.unrealizedPnl / view.summary.totalCost
      : null;

  const payload = buildContributorPayload({
    view,
    cohort,
    consent,
    ytdReturnPct,
    dividendYield: null, // V1: geen weighted yield in payload — bucket valt terug op '0-1%'.
    asOf: input.asOf,
  });

  const report = buildCommunityBenchmark({
    payload,
    cohortAggregate: null, // v1: alleen synthetische baseline tot we echte data hebben
    asOf: input.asOf,
  });

  return { report, consent, noPortfolio: false, notContributing: false };
}
