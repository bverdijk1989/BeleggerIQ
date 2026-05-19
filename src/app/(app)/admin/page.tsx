import { notFound } from "next/navigation";
import {
  Activity,
  AlertOctagon,
  Bot,
  CreditCard,
  Database,
  Flag,
  Lock,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import {
  isAdminEmail,
  loadAdminDashboard,
  recordAdminAction,
  type AdminDashboardData,
} from "@/lib/admin";
import { resolveUserFromServer } from "@/lib/auth";

export const metadata = {
  title: "Admin console",
};

export const dynamic = "force-dynamic";

interface SearchParams {
  user?: string;
}

interface Props {
  searchParams: Promise<SearchParams>;
}

/**
 * /admin — interne beheerconsole (Module 15).
 *
 * **Toegang**: alleen wanneer email in `BIQ_ADMIN_EMAILS`-env-allowlist
 * staat. Non-admins krijgen 404 (security-by-obscurity — `notFound()`
 * lekt niet of de route bestaat).
 *
 * **Privacy-laag**: geen portfolio-waardes, geen volledige emails, geen
 * IP-adressen. Support-info wordt automatisch gemaskeerd.
 *
 * **Audit-trail**: elke admin-page-view en lookup wordt vastgelegd in
 * audit-log met category=system + metadata.adminAction=true.
 */
export default async function AdminConsolePage({ searchParams }: Props) {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    // Geen 401-flash voor non-auth — gewoon 404.
    notFound();
  }

  const adminCtx = isAdminEmail(auth.user.email);
  if (!adminCtx.isAdmin) {
    // Audit de blocked-attempt (zonder PII te tonen aan de attacker).
    await recordAdminAction({
      adminEmail: auth.user.email,
      action: "admin.access_denied",
      summary: "Niet-admin probeerde /admin te bereiken.",
    });
    notFound();
  }

  const params = await searchParams;
  const data = await loadAdminDashboard({ supportEmail: params.user ?? null });

  // Audit elke dashboard-view (Module 15-eis: audit log voor adminacties).
  await recordAdminAction({
    adminEmail: auth.user.email,
    action: params.user ? "admin.lookup_user" : "admin.view_dashboard",
    summary: params.user
      ? `Admin bekeek support-info voor gemaskeerde user.`
      : "Admin opende dashboard.",
    metadata: params.user ? { searchedEmail: maskForAudit(params.user) } : {},
  });

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Beheerconsole"
        description="Operationeel overzicht — geen portfolio-data, geen volledige PII."
        actions={
          <Badge variant="outline" className="text-[10px]">
            v1 · env-allowlist
          </Badge>
        }
      />

      {/* 1. Active users */}
      <Section
        title="Actieve gebruikers"
        description={`${data.activeUsers.totalUsers} totaal · ${data.activeUsers.active24h} actief 24u · ${data.activeUsers.active7d} actief 7d`}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {(["FREE", "PRO", "ELITE", "ADVISOR"] as const).map((t) => (
            <Stat
              key={t}
              icon={Users}
              label={t}
              value={`${data.activeUsers.byTier[t]}`}
            />
          ))}
        </div>
      </Section>

      {/* 2. Subscriptions */}
      <Section
        title="Subscriptions"
        description={`${data.subscriptions.withStripeSubscription} met externe (Stripe) subscription`}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {(["FREE", "PRO", "ELITE", "ADVISOR"] as const).map((t) => (
            <Stat
              key={t}
              icon={CreditCard}
              label={`${t} actief`}
              value={`${data.subscriptions.byTier[t]}`}
            />
          ))}
        </div>
      </Section>

      {/* 4. Provider health */}
      <Section
        title="Dataprovider health"
        description="Markt-data + AI-provider."
      >
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <ProviderCard
            label="Markt-data"
            provider={data.providers.marketDataProvider}
            healthy={data.providers.marketDataHealthy}
          />
          <ProviderCard
            label="AI-provider"
            provider={data.providers.aiProvider}
            healthy={data.providers.aiHealthy}
          />
        </div>
      </Section>

      {/* 4b. Provider health detail (Module 26) */}
      <Section
        title="Provider health-detail"
        description="Live metrics per provider — success/failure-count, latency, fallback-invocations. Reset bij process-restart."
      >
        <ProviderHealthDetail detail={data.providerHealthDetail} />
      </Section>

      {/* 5. AI cost */}
      <Section
        title="AI-kosten & gebruik"
        description={`Sinds ${new Date(data.aiCost.windowStart).toLocaleString("nl-NL")} · ${data.aiCost.totalCalls} calls`}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat
            icon={Bot}
            label="Total calls"
            value={`${data.aiCost.totalCalls}`}
          />
          <Stat
            icon={Bot}
            label="Input tokens"
            value={formatNum(data.aiCost.totalInputTokens)}
          />
          <Stat
            icon={Bot}
            label="Output tokens"
            value={formatNum(data.aiCost.totalOutputTokens)}
          />
          <Stat
            icon={Bot}
            label="Geschat $"
            value={`$${data.aiCost.totalEstimatedUsd.toFixed(2)}`}
          />
        </div>
        {data.aiCost.byScope.length > 0 && (
          <div className="mt-3 rounded-md border border-border/40 bg-muted/10 p-2 text-[11px]">
            <p className="font-semibold uppercase tracking-wider text-muted-foreground">
              Per scope (top 10)
            </p>
            <ul className="mt-1 space-y-0.5">
              {data.aiCost.byScope.map((s) => (
                <li
                  key={s.scope}
                  className="flex items-center justify-between font-mono"
                >
                  <span>{s.scope}</span>
                  <span>
                    {s.calls}× · ${s.estimatedUsd.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* 6. Errors */}
      <Section
        title="Error log (24u)"
        description={`${data.errors.errors24h} fouten gelogd`}
      >
        <RecentEventsList
          entries={data.errors.recent}
          icon={AlertOctagon}
          emptyMessage="Geen fouten in audit-log."
        />
      </Section>

      {/* 7. Imports */}
      <Section
        title="Import statussen (7d)"
        description={`${data.imports.imports7d} imports · ${data.imports.failed7d} mislukt`}
      >
        <RecentEventsList
          entries={data.imports.recent}
          icon={Database}
          emptyMessage="Geen recente imports."
        />
      </Section>

      {/* 8. Failed jobs */}
      <Section
        title="Laatste failed jobs (7d)"
        description="System-category audit-events met action='*_failed'."
      >
        <RecentEventsList
          entries={data.failedJobs.recent.map((j) => ({
            action: j.job,
            summary: j.summary,
            occurredAt: j.occurredAt,
          }))}
          icon={XCircle}
          emptyMessage="Geen failed jobs."
        />
      </Section>

      {/* 9. Security */}
      <Section
        title="Security / audit events (24u)"
        description={`${data.security.authEvents24h} auth-events · ${data.security.failedLogins24h} failed logins`}
      >
        <RecentEventsList
          entries={data.security.recent}
          icon={Lock}
          emptyMessage="Geen auth-events."
        />
      </Section>

      {/* 3. Feature flags */}
      <Section
        title="Feature flag status"
        description="Catalog van features + tier-toegang."
      >
        <div className="rounded-md border border-border/40 bg-muted/10 p-2 text-[11px]">
          <ul className="space-y-0.5 font-mono">
            {data.featureFlags.slice(0, 30).map((f) => (
              <li key={f.key} className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Flag className="h-3 w-3" aria-hidden />
                  {f.key}
                </span>
                <span className="text-muted-foreground">
                  {f.availableIn.join(", ")}
                </span>
              </li>
            ))}
          </ul>
          {data.featureFlags.length > 30 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              ... en {data.featureFlags.length - 30} meer.
            </p>
          )}
        </div>
      </Section>

      {/* 10. Support info */}
      <Section
        title="Support-info per gebruiker"
        description="Zoek op email; output is PII-gemaskeerd."
      >
        <form className="flex gap-2" action="/admin">
          <input
            name="user"
            type="email"
            placeholder="email@voorbeeld.nl"
            defaultValue={params.user ?? ""}
            className="flex-1 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-md border border-primary/60 bg-primary/10 px-3 py-2 text-sm text-primary"
          >
            Zoek
          </button>
        </form>
        {data.support ? (
          <SupportCard data={data.support} />
        ) : params.user ? (
          <EmptyState
            icon={Users}
            title="Niet gevonden"
            description="Geen gebruiker met dat e-mailadres."
          />
        ) : null}
      </Section>

      <Section
        title="Privacy-notice"
        description="Wat wij hier WEL en NIET tonen."
      >
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4 text-xs text-emerald-200">
          <p className="flex items-start gap-2">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden
            />
            <span>
              Deze console toont <strong>geen</strong> portfolio-waarden,
              <strong>geen</strong> volledige e-mails (gemaskeerd),{" "}
              <strong>geen</strong> IP-adressen, en{" "}
              <strong>geen</strong> wachtwoord-hashes. Elke admin-page-view
              + elke lookup wordt vastgelegd in de audit-log (categorie:
              system, metadata.adminAction=true).
            </span>
          </p>
        </div>
      </Section>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-3">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden /> {label}
      </p>
      <p className="mt-1 font-mono text-base font-bold text-foreground">
        {value}
      </p>
    </div>
  );
}

function ProviderCard({
  label,
  provider,
  healthy,
}: {
  label: string;
  provider: string;
  healthy: boolean;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-surface/40 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{label}</span>
        <Badge
          variant="outline"
          className={
            healthy
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-amber-500/40 bg-amber-500/10 text-amber-300"
          }
        >
          {healthy ? "Healthy" : "Stub / niet geconfigureerd"}
        </Badge>
      </div>
      <p className="mt-1 font-mono text-xs text-muted-foreground">{provider}</p>
    </div>
  );
}

function ProviderHealthDetail({
  detail,
}: {
  detail: AdminDashboardData["providerHealthDetail"];
}) {
  if (detail.rows.length === 0) {
    return (
      <div className="rounded-md border border-border/40 bg-muted/10 p-3 text-xs text-muted-foreground">
        <p>
          Nog geen call-events gemeten sinds laatste process-start. Provider
          metrics worden in-memory bijgehouden — een herstart wist de tellers.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border/40 bg-surface/40">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5">Provider</th>
            <th className="px-2 py-1.5">Calls</th>
            <th className="px-2 py-1.5">Success</th>
            <th className="px-2 py-1.5">Fail</th>
            <th className="px-2 py-1.5">Fallback</th>
            <th className="px-2 py-1.5">Avg ms</th>
            <th className="px-2 py-1.5">p50</th>
            <th className="px-2 py-1.5">p95</th>
            <th className="px-2 py-1.5">Status</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {detail.rows.map((row) => (
            <tr key={row.provider} className="border-t border-border/30">
              <td className="px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground">
                    {row.provider}
                  </span>
                  <span className="text-[9px] uppercase text-muted-foreground">
                    {row.kind}
                  </span>
                </div>
                {row.lastError ? (
                  <p className="mt-0.5 text-[10px] text-amber-300">
                    {row.lastError}
                  </p>
                ) : null}
              </td>
              <td className="px-2 py-1.5">{row.callCount}</td>
              <td className="px-2 py-1.5 text-emerald-200">
                {row.successCount}
              </td>
              <td className="px-2 py-1.5 text-rose-200">{row.failureCount}</td>
              <td className="px-2 py-1.5 text-muted-foreground">
                {row.fallbackInvocationCount}
              </td>
              <td className="px-2 py-1.5">{row.avgLatencyMs ?? "—"}</td>
              <td className="px-2 py-1.5">{row.latencyP50Ms ?? "—"}</td>
              <td className="px-2 py-1.5">{row.latencyP95Ms ?? "—"}</td>
              <td className="px-2 py-1.5">
                <Badge
                  variant="outline"
                  className={
                    row.stale
                      ? "border-muted-foreground/30 text-muted-foreground"
                      : row.healthy
                        ? "border-emerald-500/40 text-emerald-300"
                        : "border-rose-500/40 text-rose-300"
                  }
                >
                  {row.stale ? "stale" : row.healthy ? "healthy" : "fail"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentEventsList({
  entries,
  icon: Icon,
  emptyMessage,
}: {
  entries: ReadonlyArray<{
    action?: string;
    category?: string;
    summary: string;
    occurredAt: string;
  }>;
  icon: typeof Activity;
  emptyMessage: string;
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-border/40 bg-muted/10 p-3 text-xs text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  return (
    <ul className="space-y-1">
      {entries.map((e, i) => (
        <li
          key={i}
          className="flex items-start gap-2 rounded-md border border-border/40 bg-surface/40 p-2 text-xs"
        >
          <Icon
            className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="font-mono text-foreground">
              {e.action ?? e.category}
            </p>
            <p className="text-muted-foreground">{e.summary}</p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(e.occurredAt).toLocaleString("nl-NL")}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SupportCard({
  data,
}: {
  data: NonNullable<AdminDashboardData["support"]>;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface/40 p-4 text-sm">
      <p className="font-mono text-foreground">{data.maskedEmail}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs lg:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Tier
          </p>
          <p className="font-mono text-foreground">{data.tier}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Portefeuilles
          </p>
          <p className="font-mono text-foreground">{data.portfolioCount}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Posities
          </p>
          <p className="font-mono text-foreground">{data.positionCount}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Account sinds
          </p>
          <p className="font-mono text-foreground">
            {new Date(data.createdAt).toLocaleDateString("nl-NL")}
          </p>
        </div>
      </div>
      {data.lastActivityAt && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Laatste activiteit:{" "}
          {new Date(data.lastActivityAt).toLocaleString("nl-NL")}
        </p>
      )}
    </div>
  );
}

function maskForAudit(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email.slice(0, 1)}***@${email.slice(at + 1)}`;
}

function formatNum(n: number): string {
  return new Intl.NumberFormat("nl-NL").format(n);
}
