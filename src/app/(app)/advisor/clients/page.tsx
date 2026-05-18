import {
  AlertTriangle,
  Building2,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { resolveUserFromServer } from "@/lib/auth";
import {
  isWorkspaceAdvisor,
  loadAdvisorWorkspace,
  workspaceHeaderStats,
} from "@/lib/advisor-workspace";
import { DEFAULT_WHITE_LABEL } from "@/lib/enterprise/types";

export const metadata = {
  title: "Advisor — Cliënten",
};

export const dynamic = "force-dynamic";

/**
 * /advisor/clients — Advisor Pilot Workspace dashboard (Module 24).
 *
 * **Access**: env-allowlist `ADVISOR_WORKSPACE_LINKS`. Wanneer de
 * ingelogde gebruiker niet als advisor-key voorkomt → EmptyState met
 * "geen workspace geconfigureerd" (zelfde patroon als admin-console).
 */
export default async function AdvisorClientsPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Advisor"
          title="Cliënten-dashboard"
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

  // Hard boundary: geen workspace-link → toegang weigerd, GEEN PII-leakage.
  if (!isWorkspaceAdvisor(auth.user.email)) {
    return (
      <>
        <PageHeader
          eyebrow="Advisor"
          title="Cliënten-dashboard"
          description="Deze pagina is alleen toegankelijk voor geconfigureerde advisor-accounts."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Geen workspace geconfigureerd"
          description={
            "Je account staat niet in de advisor-allowlist. Neem contact op met de pilot-beheerder om gekoppeld te worden aan één of meer cliënten."
          }
        />
      </>
    );
  }

  const { workspace } = await loadAdvisorWorkspace({
    advisorEmail: auth.user.email,
  });
  const stats = workspaceHeaderStats(workspace);
  const brand = DEFAULT_WHITE_LABEL.brandName;

  return (
    <>
      <PageHeader
        eyebrow="Advisor"
        title="Cliënten-workspace"
        description={`${stats.totalClients} gekoppelde cliënten · ${stats.totalPortfolios} portefeuilles · ${stats.totalPositions} posities totaal. ${brand} Pilot.`}
        actions={
          <Badge variant="outline" className="text-[10px]">
            Pilot · env-allowlist
          </Badge>
        }
      />

      {stats.missingLinks > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {stats.missingLinks}{" "}
              {stats.missingLinks === 1
                ? "gekoppelde cliënt-e-mail bestaat niet"
                : "gekoppelde cliënt-e-mails bestaan niet"}{" "}
              in het systeem (uitnodiging nog niet geaccepteerd of typefout in
              de allowlist). Controleer de pilot-config.
            </span>
          </p>
        </div>
      ) : null}

      <Section
        title="Cliënten"
        description="Geanonimiseerde lijst — klik een rij voor portefeuille-samenvatting + rapport-generatie."
      >
        {workspace.clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Geen cliënten gekoppeld"
            description="Je workspace staat aan, maar er zijn nog geen cliënt-e-mails gekoppeld."
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {workspace.clients.map((c) => (
              <Card key={c.clientId} className="border-border/60">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">
                      {c.maskedEmail}
                    </p>
                    <Badge variant="outline" className="text-[10px]">
                      {c.tier}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
                    <div>
                      <dt className="uppercase tracking-[0.14em]">Posities</dt>
                      <dd className="font-mono text-foreground">
                        {c.positionCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-[0.14em]">Portefeuilles</dt>
                      <dd className="font-mono text-foreground">
                        {c.portfolioCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-[0.14em]">Laatste activiteit</dt>
                      <dd className="font-mono text-foreground">
                        {c.lastActivityAt
                          ? new Date(c.lastActivityAt).toLocaleDateString(
                              "nl-NL",
                              {
                                day: "2-digit",
                                month: "short",
                              },
                            )
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex gap-2 pt-1">
                    <Button asChild size="sm" className="flex-1">
                      <Link
                        href={
                          `/advisor/clients/${c.clientId}` as never
                        }
                      >
                        Open dossier
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Branding"
        description="White-label-config — placeholder voor v2 (per-org branding)."
      >
        <div className="rounded-md border border-border/60 bg-surface/40 p-4 text-xs text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Huidige brand: <strong>{brand}</strong>. Rapporten gebruiken de
              default-white-label-config.
            </li>
            <li>
              <strong>v2-roadmap</strong>: per-pilot-advisor een{" "}
              <code>WhiteLabelConfig</code>{" "}
              (eigen logo + primary color + footer + AFM-licentie) — schema-shape
              staat al in <code>src/lib/enterprise/types.ts</code>.
            </li>
            <li>
              Audit-logging is actief: openen + exporteren van een
              cliëntdossier wordt geregistreerd (e-mails worden gehasht).
            </li>
          </ul>
        </div>
      </Section>

      <Section
        title="Hoe werkt dit?"
        description="Pilot-laag — bewuste keuzes."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="border-border/60 bg-surface/40">
            <CardContent className="space-y-2 p-4">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Building2 className="h-3 w-3" /> Multi-cliënt
              </p>
              <p className="text-xs text-muted-foreground">
                Eén advisor-account beheert meerdere cliënt-portefeuilles
                binnen een privacy-grens — alleen expliciet gekoppelde cliënten.
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-surface/40">
            <CardContent className="space-y-2 p-4">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <ShieldCheck className="h-3 w-3" /> Boundary
              </p>
              <p className="text-xs text-muted-foreground">
                Allowlist via deployment — geen DB-tabel, geen runtime-wijziging
                zonder deploy. Audit-log toont elke geopende cliënt.
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-surface/40">
            <CardContent className="space-y-2 p-4">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <FileText className="h-3 w-3" /> Rapport per cliënt
              </p>
              <p className="text-xs text-muted-foreground">
                Genereer het Advisor PDF-rapport (Module 23) per cliënt —
                informatief, geen orders. Disclaimers automatisch.
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>
    </>
  );
}
