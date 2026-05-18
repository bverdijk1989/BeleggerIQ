/**
 * Advisor PDF Report — server-side loader (Module 23).
 *
 * Verzamelt alle data-bronnen faal-safe:
 *  - portfolio-view (health + risk + allocation)
 *  - wealth-dashboard (course + goals)
 *  - stress-test report (scenarios)
 *  - behavioral coach
 *  - fundamentals coverage
 *
 * Geen secrets/PII in logs (alleen counts + identifier-hashes).
 */

import { loadBehavioralCoach } from "@/lib/analytics/behavioral/loader";
import { buildPortfolioView } from "@/lib/analytics/portfolio-view";
import { loadStressTestReport } from "@/lib/analytics/stress-tests/loader";
import { loadWealthDashboard } from "@/lib/analytics/wealth/loader";
import { portfolioRepository } from "@/lib/data";
import { getFundamentals } from "@/lib/data/fundamentals";

import { buildAdvisorReportData } from "./builder";
import type { AdvisorReportData } from "./types";

export interface LoadAdvisorReportInput {
  userEmail: string;
  /** Display-label voor de cliënt — caller geeft mee, NIET de raw e-mail. */
  clientLabel?: string;
  /** Wie genereert? Default: cliënt zelf. */
  generatedBy?: string;
  /** Optionele advisor-notitie. */
  advisorNote?: string | null;
  asOf?: Date;
}

export interface LoadAdvisorReportResult {
  ok: boolean;
  data: AdvisorReportData | null;
  /** Reden als data null is. */
  reason?: "no_portfolio" | "no_user";
}

export async function loadAdvisorReport(
  input: LoadAdvisorReportInput,
): Promise<LoadAdvisorReportResult> {
  const asOf = input.asOf ?? new Date();
  const asOfIso = asOf.toISOString();

  const ctx = await portfolioRepository
    .findUserContextByEmail(input.userEmail)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, data: null, reason: "no_user" };

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(input.userEmail)
    .catch(() => null);
  if (!portfolio) return { ok: false, data: null, reason: "no_portfolio" };

  // 1) Portfolio-view — hoofd-bron.
  const view = await buildPortfolioView(portfolio, {
    includeFundamentals: true,
    includeFactorScores: true,
  });

  // 2) Wealth-dashboard — faal-safe.
  const wealth = await loadWealthDashboard({
    userEmail: input.userEmail,
    asOf,
  }).catch(() => null);

  // 3) Stress-test — faal-safe.
  const stress = await loadStressTestReport({
    userEmail: input.userEmail,
    asOf: asOfIso,
  }).catch(() => ({ report: null, noPortfolio: true }));

  // 4) Behavioral coach — faal-safe.
  const behavioral = await loadBehavioralCoach({
    userEmail: input.userEmail,
    asOf,
  }).catch(() => null);

  // 5) Fundamentals coverage — telt hoeveel posities een geldige
  //    fundamentals-fetch hebben (yield != null OF PE != null).
  let withFundamentals = 0;
  await Promise.all(
    view.valuations.map(async (v) => {
      try {
        const f = await getFundamentals(v.holding.ticker);
        if (
          f &&
          (typeof f.dividendYield === "number" || typeof f.pe === "number")
        ) {
          withFundamentals += 1;
        }
      } catch {
        // ignore — count blijft staan
      }
    }),
  );

  const data = buildAdvisorReportData({
    generatedAt: new Date().toISOString(),
    asOf: asOfIso,
    clientLabel: input.clientLabel ?? maskEmail(input.userEmail),
    generatedBy: input.generatedBy ?? "Cliënt",
    generatedByUserId: ctx.userId,
    portfolioId: portfolio.id,
    view,
    fundamentalsCoverage: {
      withFundamentals,
      withFactorScore: view.factorScores.size,
    },
    wealth,
    stress: stress.report,
    behavioral: behavioral?.report ?? null,
    organization: null,
    advisorNote: input.advisorNote ?? null,
  });

  return { ok: true, data };
}

/**
 * Pragmatische e-mail-mask: "bart@example.com" → "b***@example.com".
 * Voorkomt dat de volledige e-mail in een rapport-titel komt zonder dat
 * de caller een display-naam meegeeft.
 */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return email;
  return `${email[0]}***${email.slice(at)}`;
}
