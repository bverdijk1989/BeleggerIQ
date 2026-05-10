import { Building2, ClipboardList, FileText, ShieldAlert, ShieldCheck, Users } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { PaywallCard } from "@/components/entitlements/paywall-card";
import { resolveUserFromServer } from "@/lib/auth";
import {
  canUseFeature,
  getFeature,
  resolveCurrentTier,
} from "@/lib/entitlements";
import {
  ENTERPRISE_FLAG_LABELS,
  ORG_ROLE_LABELS,
  resolveAllFlags,
  ROLE_PERMISSIONS,
  type EnterpriseFeatureFlag,
  type OrgRole,
} from "@/lib/enterprise";

export const metadata = {
  title: "Advisor (preview)",
};

export const dynamic = "force-dynamic";

/**
 * /advisor — voorbereidende landings-pagina voor de Advisor/Enterprise-laag.
 *
 * **Status**: nog geen multi-client functionaliteit operationeel; deze
 * pagina laat zien WAT er al staat (rollen, feature-flags, disclaimers,
 * audit-context). Volledige UI komt v2 — zie `docs/ENTERPRISE_FOUNDATION.md`.
 */
export default async function AdvisorPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Advisor"
          title="Advisor & Enterprise"
          description="Authenticatie vereist."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Niet ingelogd"
          description={auth.error}
        />
      </>
    );
  }

  const tierResult = await resolveCurrentTier(auth.user.email);
  const entitlement = canUseFeature(
    tierResult.tier,
    "advisor.multi_client",
    { overrideActive: tierResult.overrideActive },
  );

  if (!entitlement.allowed) {
    const feature = getFeature("advisor.multi_client")!;
    return (
      <>
        <PageHeader
          eyebrow="Advisor"
          title="Advisor & Enterprise"
          description="Multi-client beheer, white-label rapportage en organisatie-accounts — voorbereid, op aanvraag beschikbaar."
        />
        <Section
          title="Beschikbaar in Advisor"
          description="Een Advisor-account ontsluit multi-client dashboards, gestandaardiseerde rapportages en white-label exports."
        >
          <PaywallCard
            featureLabel={feature.label}
            description={feature.description}
            entitlement={entitlement}
            bonusCopy="In voorbereiding: organisatie-accounts, rollen (OWNER/ADMIN/ADVISOR/VIEWER/CLIENT), audit-logging per advisor-actie en compliance-disclaimers per jurisdictie. Neem contact op voor een pilot."
          />
        </Section>
      </>
    );
  }

  // Advisor is entitled — toon preview-state
  const flags = resolveAllFlags();

  return (
    <>
      <PageHeader
        eyebrow="Advisor"
        title="Advisor & Enterprise"
        description="Multi-client beheer + white-label rapportage. Deze pagina toont de voorbereidende laag — volledige UI komt v2."
        actions={
          <Badge variant="outline" className="text-[10px]">
            Preview
          </Badge>
        }
      />

      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-xs text-amber-200">
        <p className="leading-relaxed">
          <span className="font-semibold text-foreground">Voorbereiding.</span>{" "}
          Het rollen-, organisatie- en rapportage-fundament staat operationeel
          (types, role-permission-matrix, feature-flags, disclaimer-catalog).
          De multi-tenant DB-laag wordt geactiveerd zodra de eerste pilot-
          organisatie is bevestigd. Migratie-pad in{" "}
          <a href="/methodologie" className="underline">
            docs/ENTERPRISE_FOUNDATION.md
          </a>
          .
        </p>
      </div>

      <Section
        title="Rollen & permissies"
        description="Vijf rollen met expliciete permission-matrix — geen wildcard-RBAC."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(Object.keys(ROLE_PERMISSIONS) as OrgRole[]).map((role) => {
            const perms = ROLE_PERMISSIONS[role];
            const Icon = ROLE_ICONS[role] ?? ShieldCheck;
            return (
              <article
                key={role}
                className="rounded-lg border border-border/60 bg-surface/40 p-4"
              >
                <header className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {ORG_ROLE_LABELS[role]}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {role}
                    </p>
                  </div>
                </header>
                <ul className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                  {perms.map((p) => (
                    <li
                      key={p}
                      className="rounded-full border border-border/40 bg-background/40 px-2 py-0.5 font-mono text-muted-foreground"
                    >
                      {p}
                    </li>
                  ))}
                  {perms.length === 0 && (
                    <li className="text-muted-foreground">geen</li>
                  )}
                </ul>
              </article>
            );
          })}
        </div>
      </Section>

      <Section
        title="Feature-flags (huidige scope)"
        description="Runtime-toggleable per env / per org / per user. Default uit; gefaseerd inschakelen tijdens pilots."
      >
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {(Object.keys(flags) as EnterpriseFeatureFlag[]).map((flag) => (
            <div
              key={flag}
              className="flex items-center justify-between rounded-md border border-border/60 bg-surface/40 px-3 py-2"
            >
              <div>
                <p className="text-sm text-foreground">
                  {ENTERPRISE_FLAG_LABELS[flag]}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {flag}
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  flags[flag]
                    ? "border-emerald-500/40 text-emerald-300"
                    : "text-muted-foreground"
                }
              >
                {flags[flag] ? "AAN" : "uit"}
              </Badge>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Wat al staat"
        description="Het fundament is operationeel; UI-flows worden na pilot-bevestiging geactiveerd."
      >
        <ul className="space-y-2 text-sm text-foreground">
          <FoundationItem
            icon={Users}
            label="Role-permission matrix"
            sublabel="src/lib/enterprise/roles.ts — 5 rollen × 9 permissions, expliciet"
          />
          <FoundationItem
            icon={Building2}
            label="Organization + Membership types"
            sublabel="src/lib/enterprise/types.ts — type-laag klaar; Prisma-tabellen wachten op pilot"
          />
          <FoundationItem
            icon={FileText}
            label="Compliance disclaimer-catalog"
            sublabel="src/lib/enterprise/disclaimers.ts — incl. AFM-disclaimer (NL) en white-label footer"
          />
          <FoundationItem
            icon={ClipboardList}
            label="Report-spec + audit-context"
            sublabel="src/lib/enterprise/report-spec.ts + audit-context.ts — PDF-renderer komt v2"
          />
        </ul>
      </Section>
    </>
  );
}

function FoundationItem({
  icon: Icon,
  label,
  sublabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sublabel: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-md border border-border/60 bg-surface/40 p-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <Icon className="h-4 w-4 text-primary" aria-hidden />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{sublabel}</p>
      </div>
    </li>
  );
}

const ROLE_ICONS: Partial<
  Record<OrgRole, React.ComponentType<{ className?: string }>>
> = {
  OWNER: Building2,
  ADMIN: ShieldCheck,
  ADVISOR: Users,
  VIEWER: ClipboardList,
  CLIENT: Users,
};
