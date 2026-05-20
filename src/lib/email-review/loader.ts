/**
 * Monthly Investor Review — server-side loader (Module 34).
 *
 * Verzamelt de 6 sectie-bronnen faal-safe en delegeert aan de pure
 * `buildMonthlyReview`-generator.
 *
 * **Hergebruikt**:
 *  - buildPortfolioView → health + risk
 *  - loadRiskTrendReport (M30) → health-delta
 *  - loadRiskControlTowerReport (M29) → grootste risico
 *  - loadWealthDashboard (M21) → doelvoortgang
 *  - buildPortfolioDepth (M26) → datakwaliteit
 *  - notificationRepository → belangrijkste alert
 *
 * **Privacy**: alleen geaggregeerde scores doorgeven; nooit raw bedragen
 * tenzij `detailedFigures` opt-in (en zelfs dan: generator beslist).
 */

import { buildPortfolioView } from "@/lib/analytics";
import { buildPortfolioDepth } from "@/lib/analytics/data-depth/loader";
import { loadRiskControlTowerReport } from "@/lib/analytics/risk-control-tower";
import { loadRiskTrendReport } from "@/lib/analytics/risk-trend";
import { loadWealthDashboard } from "@/lib/analytics/wealth/loader";
import { portfolioRepository } from "@/lib/data";
import { getFundamentals } from "@/lib/data/fundamentals";
import { log } from "@/lib/log";

import { buildMonthlyReview } from "./generator";
import type { MonthlyReviewData } from "./types";
import { buildUnsubscribeUrl } from "./unsubscribe";

const MONTHS_NL = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

export interface LoadMonthlyReviewInput {
  userEmail: string;
  /** Display-naam — wordt gemaskeerd indien e-mail. */
  greetingName?: string | null;
  detailedFigures: boolean;
  /** Basis-URL voor app- en unsubscribe-links. */
  baseUrl: string;
  /** Override "nu" voor tests. */
  asOf?: Date;
}

export interface LoadMonthlyReviewResult {
  ok: boolean;
  data: MonthlyReviewData | null;
  reason?: "no_portfolio";
}

export async function loadMonthlyReview(
  input: LoadMonthlyReviewInput,
): Promise<LoadMonthlyReviewResult> {
  const asOf = input.asOf ?? new Date();
  const periodLabel = `${MONTHS_NL[asOf.getUTCMonth()]} ${asOf.getUTCFullYear()}`;

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(input.userEmail)
    .catch(() => null);

  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const unsubscribeUrl = buildUnsubscribeUrl(input.userEmail, baseUrl);
  const appUrl = `${baseUrl}/dashboard`;
  const greetingName = safeGreeting(input.greetingName, input.userEmail);

  if (!portfolio || portfolio.holdings.length === 0) {
    // Lege portefeuille: nog steeds een review (motiveert onboarding).
    return {
      ok: true,
      data: buildMonthlyReview({
        generatedAt: asOf.toISOString(),
        periodLabel,
        greetingName,
        detailedFigures: input.detailedFigures,
        unsubscribeUrl,
        appUrl,
        healthScoreNow: null,
        healthScorePrev: null,
        healthGrade: null,
        topRisk: null,
        goals: null,
        monthlyAction: null,
        topAlert: null,
        dataQuality: null,
      }),
    };
  }

  const view = await buildPortfolioView(portfolio, {
    includeFundamentals: true,
    includeFactorScores: true,
  });

  // --- Health-delta uit risk-trend (M30) ---
  let healthScorePrev: number | null = null;
  try {
    const trend = await loadRiskTrendReport({ portfolioId: portfolio.id });
    const points = trend.points;
    if (points.length >= 2) {
      healthScorePrev =
        points[points.length - 2]!.snapshot.healthScore;
    }
  } catch (error) {
    log.info("email-review", "risk_trend_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }

  // --- Grootste risico uit risk-tower (M29) ---
  let topRisk: { label: string; severity: "green" | "orange" | "red" | "gray" } | null =
    null;
  try {
    const tower = await loadRiskControlTowerReport({
      view,
      userEmail: input.userEmail,
    });
    // Pak ergste categorie (red > orange > rest).
    const sorted = [...tower.categories].sort(
      (a, b) => severityRank(b.severity) - severityRank(a.severity),
    );
    const worst = sorted[0];
    if (worst) {
      topRisk = { label: worst.label, severity: worst.severity };
    }
  } catch (error) {
    log.info("email-review", "risk_tower_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }

  // --- Doelvoortgang uit wealth (M21) ---
  let goals: {
    totalGoals: number;
    achievableGoals: number;
    courseStatus: string;
  } | null = null;
  try {
    const wealth = await loadWealthDashboard({
      userEmail: input.userEmail,
      asOf,
    });
    if (wealth) {
      goals = {
        totalGoals: wealth.course.totalGoals,
        achievableGoals: wealth.course.achievableGoals,
        courseStatus: wealth.course.status,
      };
    }
  } catch (error) {
    log.info("email-review", "wealth_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }

  // --- Maandactie uit rebalance-recommendations ---
  const topRebalance = view.rebalance.recommendations[0] ?? null;
  const monthlyAction = topRebalance
    ? {
        title: `${actionLabel(topRebalance.action)}: ${topRebalance.ticker}`,
        kind: actionKind(topRebalance.action),
      }
    : null;

  // --- Datakwaliteit uit data-depth (M26) ---
  let dataQuality: { depthScore: number; tierLabel: string } | null = null;
  try {
    const fundamentalsByTicker = new Map(
      await Promise.all(
        view.valuations.map(async (v) => {
          try {
            return [
              v.holding.ticker,
              await getFundamentals(v.holding.ticker),
            ] as const;
          } catch {
            return [v.holding.ticker, null] as const;
          }
        }),
      ),
    );
    const depth = buildPortfolioDepth({
      view,
      fundamentalsByTicker,
      hasMacroRegime: true,
    });
    dataQuality = {
      depthScore: depth.portfolio.weightedScore,
      tierLabel: tierLabelFromScore(depth.portfolio.weightedScore),
    };
  } catch (error) {
    log.info("email-review", "data_depth_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }

  // --- Belangrijkste alert uit health-signals (proxy) ---
  let topAlert: {
    title: string;
    severity: "info" | "warning" | "critical";
  } | null = null;
  const criticalSignal = view.health.signals.find(
    (s) => s.severity === "critical",
  );
  const warningSignal = view.health.signals.find(
    (s) => s.severity === "warning",
  );
  if (criticalSignal) {
    topAlert = { title: criticalSignal.label, severity: "critical" };
  } else if (warningSignal) {
    topAlert = { title: warningSignal.label, severity: "warning" };
  }

  return {
    ok: true,
    data: buildMonthlyReview({
      generatedAt: asOf.toISOString(),
      periodLabel,
      greetingName,
      detailedFigures: input.detailedFigures,
      unsubscribeUrl,
      appUrl,
      healthScoreNow: view.health.score,
      healthScorePrev,
      healthGrade: view.health.grade,
      topRisk,
      goals,
      monthlyAction,
      topAlert,
      dataQuality,
    }),
  };
}

// ============================================================
//  Helpers
// ============================================================

function safeGreeting(
  name: string | null | undefined,
  email: string,
): string {
  const trimmed = (name ?? "").trim();
  // Geen e-mail in begroeting; geen lege string.
  if (trimmed.length > 0 && !trimmed.includes("@")) {
    return trimmed.split(/\s+/)[0]!;
  }
  // Fallback: eerste letter van e-mail-local-part + generieke aanhef.
  void email;
  return "belegger";
}

function severityRank(s: string): number {
  switch (s) {
    case "red":
      return 3;
    case "orange":
      return 2;
    case "green":
      return 1;
    default:
      return 0;
  }
}

function actionLabel(action: string): string {
  switch (action) {
    case "TRIM_LIGHT":
      return "Lichte trim";
    case "TRIM_HEAVY":
      return "Trim zwaarder";
    case "RECONSIDER":
      return "Heroverweeg";
    case "NO_ACTION":
    default:
      return "Houd vast";
  }
}

function actionKind(action: string): "buy" | "trim" | "hold" | "review" {
  switch (action) {
    case "TRIM_LIGHT":
    case "TRIM_HEAVY":
      return "trim";
    case "RECONSIDER":
      return "review";
    case "NO_ACTION":
    default:
      return "hold";
  }
}

function tierLabelFromScore(score: number): string {
  if (score >= 85) return "Uitstekend";
  if (score >= 70) return "Goed";
  if (score >= 50) return "Acceptabel";
  if (score >= 25) return "Beperkt";
  return "Onvoldoende";
}
