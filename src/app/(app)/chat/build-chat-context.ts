import {
  buildPortfolioView,
  generateAllocationPlan,
  type PortfolioView,
} from "@/lib/analytics";
import { computeRegimeScore } from "@/lib/analytics/regime/engine";
import { fetchRegimeInputs } from "@/lib/data/regime";
import { portfolioRepository } from "@/lib/data";
import type { AllocationPlan } from "@/types/allocation";
import type { ChatContext } from "@/types/chat";
import type { MarketRegimeScore } from "@/types/regime";

/**
 * Server-side chat context loader. Levert de engine-uitkomsten die
 * door `buildAssistantResponse` gebruikt worden plus een compacte
 * `ChatContext`-snapshot voor de UI-chips.
 *
 * Retourneert `null` als er geen portefeuille is — de page toont dan
 * een empty state.
 */

export interface LoadedChatContext {
  ctx: ChatContext;
  view: PortfolioView;
  plan: AllocationPlan;
  regime: MarketRegimeScore | null;
}

const DEFAULT_BUDGET = 500;

export async function loadChatContext(
  email: string,
): Promise<LoadedChatContext | null> {
  const context = await portfolioRepository
    .findUserContextByEmail(email)
    .catch(() => null);
  if (!context || !context.portfolio) return null;

  const [view, regimeFetch] = await Promise.all([
    buildPortfolioView(context.portfolio, {
      includeFundamentals: true,
      includeFactorScores: true,
    }),
    fetchRegimeInputs(),
  ]);

  const regime = regimeFetch
    ? computeRegimeScore(regimeFetch.input, {
        asOf: regimeFetch.asOf,
        source: regimeFetch.source,
      })
    : null;

  const monthlyContribution =
    context.monthlyContribution !== null
      ? context.monthlyContribution
      : DEFAULT_BUDGET;

  const plan = generateAllocationPlan({
    portfolioId: context.portfolio.id,
    baseCurrency: view.summary.baseCurrency,
    valuations: view.valuations,
    totalValue: view.summary.totalValue,
    cashBalance: view.summary.cashBalance,
    monthlyContribution,
    policy: context.profile?.policy ?? null,
    objective: context.profile?.objective ?? "BALANCED",
    regime,
  });

  const chatCtx: ChatContext = {
    portfolio: {
      id: context.portfolio.id,
      name: context.portfolio.name,
      baseCurrency: view.summary.baseCurrency,
      totalValue: view.summary.totalValue,
      positionCount: view.summary.positionCount,
      largestPosition: view.summary.largestPosition
        ? {
            ticker: view.summary.largestPosition.ticker,
            name: view.summary.largestPosition.name,
            weight: view.summary.largestPosition.weight,
          }
        : undefined,
    },
    regime: regime
      ? {
          stance: regime.stance,
          score: regime.score,
          confidence: regime.confidence,
        }
      : null,
    risk: {
      severity: view.risk.overallSeverity,
      riskScore: view.risk.riskScore,
      topFlags: view.risk.flags
        .slice()
        .sort((a, b) => severityOrder(b.severity) - severityOrder(a.severity))
        .slice(0, 3)
        .map((f) => ({ code: f.code, label: f.label })),
    },
    health: {
      grade: view.health.grade,
      score: view.health.score,
      signals: view.health.signals.length,
    },
    plan: {
      recommendations: plan.recommendations.length,
      deployed: plan.deployedAmount ?? 0,
      cashReserved: plan.cashReserved ?? 0,
    },
    asOf: view.lastUpdated,
  };

  return { ctx: chatCtx, view, plan, regime };
}

function severityOrder(severity: string): number {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "elevated":
      return 3;
    case "moderate":
      return 2;
    default:
      return 0;
  }
}
