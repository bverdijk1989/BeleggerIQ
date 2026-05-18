/**
 * Admin dashboard loader (Module 15).
 *
 * Aggregator over bestaande data-bronnen — leest GEEN portfolio-waardes
 * en GEEN PII-velden in. Geaggregeerde counts + maskered support-info.
 *
 * Faal-safe: elke sub-fetch wrapped in try/catch met sensible defaults.
 */

import { prisma } from "@/lib/data/prisma";
import { ENTERPRISE_FLAG_LABELS, DEFAULT_ENTERPRISE_FLAGS } from "@/lib/enterprise/types";
import { isEnterpriseFlagEnabled } from "@/lib/enterprise/feature-flags";
import { FEATURE_CATALOG } from "@/lib/entitlements/catalog";
import { snapshotCostMeter } from "@/lib/perf/cost-meter";
import type { BillingTier } from "@/types/profile";

import { maskEmail } from "./guards";
import type {
  ActiveUsersSummary,
  AdminDashboardData,
  AiCostSummary,
  ErrorLogSummary,
  FailedJobsSummary,
  FeatureFlagStatus,
  ImportStatusSummary,
  ProviderHealthSummary,
  SecurityEventsSummary,
  SubscriptionSummary,
  SupportUserInfo,
} from "./types";

const TIERS: BillingTier[] = ["FREE", "PRO", "ELITE", "ADVISOR"];

const DAY_MS = 86_400_000;

export interface LoadAdminDashboardInput {
  /** Optioneel: support-lookup voor een specifieke gebruiker (email). */
  supportEmail?: string | null;
  /** Override `now` — alleen voor tests. */
  now?: Date;
}

export async function loadAdminDashboard(
  input: LoadAdminDashboardInput = {},
): Promise<AdminDashboardData> {
  const now = input.now ?? new Date();

  const [
    activeUsers,
    subscriptions,
    errors,
    imports,
    failedJobs,
    security,
    support,
  ] = await Promise.all([
    loadActiveUsers(now),
    loadSubscriptions(),
    loadErrorLog(now),
    loadImportStatus(now),
    loadFailedJobs(now),
    loadSecurityEvents(now),
    input.supportEmail ? loadSupportUserInfo(input.supportEmail) : Promise.resolve(null),
  ]);

  return {
    generatedAt: now.toISOString(),
    activeUsers,
    subscriptions,
    featureFlags: loadFeatureFlagStatus(),
    providers: loadProviderHealth(),
    aiCost: loadAiCost(),
    errors,
    imports,
    failedJobs,
    security,
    support,
  };
}

// ============================================================
//  Sub-loaders — elk faal-safe (return defaults bij fout)
// ============================================================

async function loadActiveUsers(now: Date): Promise<ActiveUsersSummary> {
  const empty: ActiveUsersSummary = {
    totalUsers: 0,
    active24h: 0,
    active7d: 0,
    byTier: { FREE: 0, PRO: 0, ELITE: 0, ADVISOR: 0 },
  };
  try {
    const since24h = new Date(now.getTime() - DAY_MS);
    const since7d = new Date(now.getTime() - 7 * DAY_MS);
    const [totalUsers, profilesByTier, active24h, active7d] = await Promise.all([
      prisma.user.count(),
      prisma.userProfile.groupBy({
        by: ["billingTier"],
        _count: { _all: true },
      }),
      prisma.auditEntry.findMany({
        where: { createdAt: { gte: since24h }, userId: { not: null } },
        select: { userId: true },
        distinct: ["userId"],
      }),
      prisma.auditEntry.findMany({
        where: { createdAt: { gte: since7d }, userId: { not: null } },
        select: { userId: true },
        distinct: ["userId"],
      }),
    ]);
    const byTier = { ...empty.byTier };
    for (const row of profilesByTier) {
      const t = row.billingTier as BillingTier;
      if (t in byTier) byTier[t] = row._count._all;
    }
    return {
      totalUsers,
      active24h: active24h.length,
      active7d: active7d.length,
      byTier,
    };
  } catch {
    return empty;
  }
}

async function loadSubscriptions(): Promise<SubscriptionSummary> {
  const empty: SubscriptionSummary = {
    byTier: { FREE: 0, PRO: 0, ELITE: 0, ADVISOR: 0 },
    withStripeSubscription: 0,
  };
  try {
    const [groups, withStripe] = await Promise.all([
      prisma.subscription.groupBy({
        by: ["tier"],
        _count: { _all: true },
        where: { status: { in: ["ACTIVE", "TRIALING"] } },
      }),
      prisma.subscription.count({
        where: {
          externalId: { not: null },
          status: { in: ["ACTIVE", "TRIALING"] },
        },
      }),
    ]);
    const byTier = { ...empty.byTier };
    for (const g of groups) {
      const t = g.tier as BillingTier;
      if (t in byTier) byTier[t] = g._count._all;
    }
    return { byTier, withStripeSubscription: withStripe };
  } catch {
    return empty;
  }
}

function loadFeatureFlagStatus(): ReadonlyArray<FeatureFlagStatus> {
  const out: FeatureFlagStatus[] = [];
  // Billing-tier features uit catalog.
  for (const f of FEATURE_CATALOG) {
    out.push({
      key: f.key,
      enabled: true, // de feature bestaat; tier-gating gebeurt downstream
      availableIn: f.availableIn,
    });
  }
  // Enterprise-flags (Module 14) — komen met default-state uit.
  for (const flag of Object.keys(DEFAULT_ENTERPRISE_FLAGS) as Array<
    keyof typeof DEFAULT_ENTERPRISE_FLAGS
  >) {
    out.push({
      key: `enterprise.${flag}`,
      enabled: isEnterpriseFlagEnabled(flag),
      availableIn: ["ADVISOR"],
    });
  }
  // Labels (voor de UI) — niet exposed via deze data-shape; pagina kan
  // zelf via ENTERPRISE_FLAG_LABELS oplossen.
  void ENTERPRISE_FLAG_LABELS;
  return out;
}

function loadProviderHealth(): ProviderHealthSummary {
  const marketData = process.env.MARKET_DATA_PROVIDER ?? "stub";
  const aiProvider = process.env.AI_PROVIDER ?? "deterministic";
  return {
    marketDataProvider: marketData,
    aiProvider,
    // Health-flag is een proxy: provider geconfigureerd = healthy bij
    // gebrek aan beter signal. Een echte ping zou de loader async-zwaar
    // maken en provider-rate-limits raken; out-of-scope voor v1.
    marketDataHealthy: marketData !== "stub" && marketData !== "none",
    aiHealthy: aiProvider !== "deterministic",
    marketDataLastError: null,
    aiLastError: null,
  };
}

function loadAiCost(): AiCostSummary {
  try {
    const snap = snapshotCostMeter();
    const byScope = Object.entries(snap.byScope).map(([scope, b]) => ({
      scope,
      calls: b.callCount,
      estimatedUsd: b.costUsd,
    }));
    return {
      windowStart: snap.windowStart,
      totalCalls: snap.total.callCount,
      totalInputTokens: snap.total.inputTokens,
      totalOutputTokens: snap.total.outputTokens,
      totalEstimatedUsd: snap.total.costUsd,
      byScope: byScope
        .sort((a, b) => b.estimatedUsd - a.estimatedUsd)
        .slice(0, 10),
    };
  } catch {
    return {
      windowStart: new Date().toISOString(),
      totalCalls: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalEstimatedUsd: 0,
      byScope: [],
    };
  }
}

async function loadErrorLog(now: Date): Promise<ErrorLogSummary> {
  const empty: ErrorLogSummary = { errors24h: 0, recent: [] };
  try {
    const since = new Date(now.getTime() - DAY_MS);
    const [count, recent] = await Promise.all([
      prisma.auditEntry.count({
        where: {
          createdAt: { gte: since },
          OR: [
            { action: { contains: "failed" } },
            { action: { contains: "error" } },
          ],
        },
      }),
      prisma.auditEntry.findMany({
        where: {
          OR: [
            { action: { contains: "failed" } },
            { action: { contains: "error" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { action: true, summary: true, createdAt: true },
      }),
    ]);
    return {
      errors24h: count,
      recent: recent.map((r) => ({
        action: r.action,
        summary: r.summary,
        occurredAt: r.createdAt.toISOString(),
      })),
    };
  } catch {
    return empty;
  }
}

async function loadImportStatus(now: Date): Promise<ImportStatusSummary> {
  const empty: ImportStatusSummary = { imports7d: 0, failed7d: 0, recent: [] };
  try {
    const since = new Date(now.getTime() - 7 * DAY_MS);
    const [imports7d, failed7d, recent] = await Promise.all([
      prisma.auditEntry.count({
        where: {
          createdAt: { gte: since },
          category: "transactions",
          action: { contains: "import" },
        },
      }),
      prisma.auditEntry.count({
        where: {
          createdAt: { gte: since },
          category: "transactions",
          action: { contains: "import" },
          summary: { contains: "fail", mode: "insensitive" },
        },
      }),
      prisma.auditEntry.findMany({
        where: {
          category: "transactions",
          action: { contains: "import" },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { action: true, summary: true, createdAt: true },
      }),
    ]);
    return {
      imports7d,
      failed7d,
      recent: recent.map((r) => ({
        action: r.action,
        summary: r.summary,
        occurredAt: r.createdAt.toISOString(),
      })),
    };
  } catch {
    return empty;
  }
}

async function loadFailedJobs(now: Date): Promise<FailedJobsSummary> {
  const empty: FailedJobsSummary = { recent: [] };
  try {
    const since = new Date(now.getTime() - 7 * DAY_MS);
    const recent = await prisma.auditEntry.findMany({
      where: {
        createdAt: { gte: since },
        category: "system",
        action: { contains: "failed" },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { action: true, summary: true, createdAt: true },
    });
    return {
      recent: recent.map((r) => ({
        job: r.action,
        summary: r.summary,
        occurredAt: r.createdAt.toISOString(),
      })),
    };
  } catch {
    return empty;
  }
}

async function loadSecurityEvents(now: Date): Promise<SecurityEventsSummary> {
  const empty: SecurityEventsSummary = {
    authEvents24h: 0,
    failedLogins24h: 0,
    recent: [],
  };
  try {
    const since = new Date(now.getTime() - DAY_MS);
    const [authEvents24h, failedLogins24h, recent] = await Promise.all([
      prisma.auditEntry.count({
        where: { createdAt: { gte: since }, category: "auth" },
      }),
      prisma.auditEntry.count({
        where: {
          createdAt: { gte: since },
          category: "auth",
          action: { contains: "fail", mode: "insensitive" },
        },
      }),
      prisma.auditEntry.findMany({
        where: { category: "auth" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          category: true,
          action: true,
          summary: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      authEvents24h,
      failedLogins24h,
      recent: recent.map((r) => ({
        category: r.category,
        action: r.action,
        summary: r.summary,
        occurredAt: r.createdAt.toISOString(),
      })),
    };
  } catch {
    return empty;
  }
}

async function loadSupportUserInfo(
  email: string,
): Promise<SupportUserInfo | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: { select: { billingTier: true } },
        portfolios: {
          select: {
            id: true,
            holdings: { select: { id: true } },
          },
        },
      },
    });
    if (!user) return null;
    const lastActivity = await prisma.auditEntry.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const positionCount = user.portfolios.reduce(
      (sum, p) => sum + p.holdings.length,
      0,
    );
    return {
      maskedEmail: maskEmail(user.email),
      tier: (user.profile?.billingTier ?? "FREE") as BillingTier,
      portfolioCount: user.portfolios.length,
      positionCount,
      createdAt: user.createdAt.toISOString(),
      lastActivityAt: lastActivity?.createdAt.toISOString() ?? null,
    };
  } catch {
    return null;
  }
}
