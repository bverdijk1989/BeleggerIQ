/**
 * Admin console — types (Module 15).
 *
 * **Privacy-first**: shapes hier bevatten BEWUST geen PII (geen volledige
 * e-mails, geen portfolio-waarden, geen IP-adressen). Wat we tonen is
 * geaggregeerd of geanonimiseerd. Voor individuele support-acties komt
 * `supportInfoForUser(email)` apart langs en die maskeert ook.
 *
 * **Geen rewrite**: deze module leest uit bestaande infrastructuur
 * (audit-log, perf cost-meter, entitlements catalog, behavioral state-
 * tabellen). Geen nieuwe Prisma-tabellen.
 */

import type { ISODateString } from "@/types/common";
import type { BillingTier } from "@/types/profile";

/** Resultaat van `isAdminUser` — voor type-clarity in pages/actions. */
export interface AdminContext {
  email: string;
  isAdmin: boolean;
  /** Komt 't uit env-allowlist of via toekomstige DB-role? */
  source: "env_allowlist" | "db_role" | "none";
}

/** Sub-card: actieve gebruikers. */
export interface ActiveUsersSummary {
  totalUsers: number;
  /** Gebruikers met activiteit in afgelopen 24u (audit-log proxy). */
  active24h: number;
  /** Gebruikers met activiteit in afgelopen 7d. */
  active7d: number;
  /** Verdeling per billing-tier (count per tier). */
  byTier: Record<BillingTier, number>;
}

/** Sub-card: subscription/tier overview. */
export interface SubscriptionSummary {
  byTier: Record<BillingTier, number>;
  /** Hoeveel users hebben een Stripe-subscription ID (proxy voor "betalend"). */
  withStripeSubscription: number;
}

/** Sub-card: feature-flag status. */
export interface FeatureFlagStatus {
  key: string;
  enabled: boolean;
  /** Tiers waarin deze flag/feature staat. */
  availableIn: ReadonlyArray<BillingTier>;
}

/** Sub-card: dataprovider health (markt-data + AI). */
export interface ProviderHealthSummary {
  marketDataProvider: string;
  aiProvider: string;
  /** Healthy = recent succesvolle call binnen window. */
  marketDataHealthy: boolean;
  aiHealthy: boolean;
  /** Optioneel last-error-summary (geen secrets, geen request-bodies). */
  marketDataLastError: string | null;
  aiLastError: string | null;
}

/** Detail-row per provider (Module 26). */
export interface ProviderHealthDetailRow {
  provider: string;
  kind: "market-data" | "ai" | "macro" | "fundamentals";
  callCount: number;
  successCount: number;
  failureCount: number;
  /** Aantal calls dat via fallback-chain ging. */
  fallbackInvocationCount: number;
  /** Geaggregeerde latency-tellers in ms. */
  avgLatencyMs: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  lastSuccessAt: ISODateString | null;
  lastFailureAt: ISODateString | null;
  lastError: string | null;
  healthy: boolean;
  stale: boolean;
}

export interface ProviderHealthDetailSummary {
  windowStart: ISODateString;
  rows: ReadonlyArray<ProviderHealthDetailRow>;
}

/** Sub-card: AI-kosten + gebruik. */
export interface AiCostSummary {
  windowStart: ISODateString;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedUsd: number;
  /** Per scope (briefing, confidence, explain:*). */
  byScope: Array<{ scope: string; calls: number; estimatedUsd: number }>;
}

/** Sub-card: error log samenvatting (laatste audit "ERROR/WARN"-events). */
export interface ErrorLogSummary {
  /** Aantal error-entries afgelopen 24u (audit category=system + action=*_failed). */
  errors24h: number;
  /** Laatste 5 entries — alleen action + summary, geen metadata-blob. */
  recent: Array<{
    action: string;
    summary: string;
    occurredAt: ISODateString;
  }>;
}

/** Sub-card: import statussen (DEGIRO etc). */
export interface ImportStatusSummary {
  /** Aantal imports afgelopen 7d. */
  imports7d: number;
  /** Aantal failed imports in dezelfde window. */
  failed7d: number;
  recent: Array<{
    action: string;
    summary: string;
    occurredAt: ISODateString;
  }>;
}

/** Sub-card: laatste failed jobs (cron + background tasks). */
export interface FailedJobsSummary {
  recent: Array<{
    job: string;
    summary: string;
    occurredAt: ISODateString;
  }>;
}

/** Sub-card: security/audit events. */
export interface SecurityEventsSummary {
  /** Aantal auth-events afgelopen 24u. */
  authEvents24h: number;
  /** Failed login attempts afgelopen 24u. */
  failedLogins24h: number;
  /** Recente high-severity audit events. */
  recent: Array<{
    category: string;
    action: string;
    summary: string;
    occurredAt: ISODateString;
  }>;
}

/** Sub-card: support-info per gebruiker (PII-masked). */
export interface SupportUserInfo {
  /** Email gemaskeerd (b***@example.com). */
  maskedEmail: string;
  /** Huidige tier. */
  tier: BillingTier;
  /** Aantal portefeuilles (geen waardes!). */
  portfolioCount: number;
  /** Aantal posities cumulatief (geen waardes!). */
  positionCount: number;
  /** Created-at van het account. */
  createdAt: ISODateString;
  /** Laatste activity (audit-log proxy). */
  lastActivityAt: ISODateString | null;
}

/**
 * Hoofd-output van de admin-dashboard-loader. Alle 10 spec-cards in
 * één geaggregeerde shape — pagina rendert per card.
 */
export interface AdminDashboardData {
  generatedAt: ISODateString;
  activeUsers: ActiveUsersSummary;
  subscriptions: SubscriptionSummary;
  featureFlags: ReadonlyArray<FeatureFlagStatus>;
  providers: ProviderHealthSummary;
  /** Detailed per-provider health (Module 26). */
  providerHealthDetail: ProviderHealthDetailSummary;
  aiCost: AiCostSummary;
  errors: ErrorLogSummary;
  imports: ImportStatusSummary;
  failedJobs: FailedJobsSummary;
  security: SecurityEventsSummary;
  /** Optioneel: support-info als de admin een specifieke user opvraagt. */
  support: SupportUserInfo | null;
}
