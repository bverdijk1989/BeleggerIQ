import {
  ArrowLeft,
  Download,
  FileText,
  HeartPulse,
  Printer,
  ShieldAlert,
  ShieldCheck,
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
  loadAdvisorClientDetail,
  recordAdvisorAccessDenied,
  recordAdvisorClientOpened,
} from "@/lib/advisor-workspace";

export const metadata = {
  title: "Advisor — Cliëntdossier",
};

export const dynamic = "force-dynamic";

interface AdvisorClientDetailPageProps {
  params: Promise<{ clientId: string }>;
}

export default async function AdvisorClientDetailPage({
  params,
}: AdvisorClientDetailPageProps) {
  const { clientId } = await params;

  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Advisor"
          title="Cliëntdossier"
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

  if (!isWorkspaceAdvisor(auth.user.email)) {
    return (
      <>
        <PageHeader
          eyebrow="Advisor"
          title="Cliëntdossier"
          description="Geen workspace geconfigureerd voor dit account."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Toegang geweigerd"
          description="Je account is niet geconfigureerd als advisor."
        />
      </>
    );
  }

  const result = await loadAdvisorClientDetail({
    advisorEmail: auth.user.email,
    clientId,
  });

  if (!result.detail) {
    // Boundary failure → log + EmptyState. Geen 404 naar de gebruiker;
    // dezelfde tekst voor not-linked vs client-not-found voorkomt
    // enumeration-aanvallen ("welke clientIds bestaan?").
    await recordAdvisorAccessDenied({
      advisorEmail: auth.user.email,
      attemptedClientId: clientId,
      reason: result.decision.reason,
    });
    return (
      <>
        <PageHeader
          eyebrow="Advisor"
          title="Cliëntdossier"
          description="Dit dossier is niet aan jouw workspace gekoppeld."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Toegang geweigerd"
          description="Je hebt geen toegang tot dit cliëntdossier. Neem contact op met de pilot-beheerder als je denkt dat dit een vergissing is."
        />
        <div className="mt-4">
          <Button asChild variant="outline" size="sm">
            <Link href={"/advisor/clients" as never}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Terug naar cliëntenlijst
            </Link>
          </Button>
        </div>
      </>
    );
  }

  // Boundary ok → log open-event. Géén raw e-mail in audit-metadata.
  await recordAdvisorClientOpened({
    advisorEmail: auth.user.email,
    clientEmail: result.detail.unsafeEmail,
  });

  const d = result.detail;
  const indicativeValue =
    d.totalValue !== null
      ? new Intl.NumberFormat("nl-NL", {
          style: "currency",
          currency: d.baseCurrency,
          maximumFractionDigits: 0,
        }).format(d.totalValue)
      : "—";

  return (
    <>
      <PageHeader
        eyebrow="Advisor · cliëntdossier"
        title={d.maskedEmail}
        description={`${d.portfolioCount} portefeuille${d.portfolioCount === 1 ? "" : "s"} · ${d.positionCount} posities · indicatieve waarde ${indicativeValue}.`}
        actions={
          <Badge variant="outline" className="text-[10px]">
            {d.tier}
          </Badge>
        }
      />

      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-200">
        <p className="leading-relaxed">
          <strong>Audit-logging actief.</strong> Het openen van dit dossier en
          elke rapport-export wordt geregistreerd in het auditlog. Cliënt-e-mails
          worden gehasht; geen ruwe persoonsgegevens belanden in logs.
        </p>
      </div>

      <Section
        title="Kerngegevens"
        description="Alleen de cijfers die nodig zijn voor het pilotproces."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Tier" value={d.tier} />
          <StatCard label="Portefeuilles" value={String(d.portfolioCount)} />
          <StatCard label="Posities" value={String(d.positionCount)} />
          <StatCard label="Indicatieve waarde" value={indicativeValue} />
        </div>
      </Section>

      <Section
        title="Rapport genereren"
        description="Hergebruikt Module 23 Advisor PDF Report MVP — output is een client-ready HTML met print-naar-PDF flow."
      >
        {d.primaryPortfolioId ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card className="border-primary/40 bg-primary/5">
              <CardContent className="space-y-2 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Printer className="h-4 w-4 text-primary" />
                  Open rapport (inline)
                </p>
                <p className="text-xs text-muted-foreground">
                  Open in nieuw tabblad → gebruik <kbd>Ctrl</kbd> /{" "}
                  <kbd>⌘</kbd> + <kbd>P</kbd> om als PDF op te slaan.
                </p>
                <Button asChild size="sm">
                  <Link
                    href={
                      `/api/advisor/clients/${d.clientId}/report` as never
                    }
                    target="_blank"
                  >
                    Open
                  </Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="border-border/60">
              <CardContent className="space-y-2 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Download className="h-4 w-4 text-primary" />
                  Download (.html)
                </p>
                <p className="text-xs text-muted-foreground">
                  Voor archivering — open lokaal in browser en print naar PDF.
                  Genereert een audit-event.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={
                      `/api/advisor/clients/${d.clientId}/report?download=1` as never
                    }
                    target="_blank"
                  >
                    Download
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="Geen primary-portfolio"
            description="Cliënt heeft nog geen primary portfolio — rapport kan niet worden gegenereerd tot er minimaal één portefeuille is."
          />
        )}
      </Section>

      <Section
        title="Verantwoording"
        description="Wat we wel en niet doen — transparant voor compliance."
      >
        <div className="rounded-md border border-border/60 bg-surface/40 p-4 text-xs text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <ShieldCheck className="mr-1 inline h-3 w-3" />
              <strong>Privacy-boundary</strong>: alleen cliënten die expliciet
              in de pilot-allowlist staan, zijn zichtbaar. Andere cliënten
              kunnen niet worden geraden via dit dossier.
            </li>
            <li>
              <HeartPulse className="mr-1 inline h-3 w-3" />
              <strong>Geen orders</strong>: deze view is informatief — geen
              koop/verkoop-knoppen, geen executie. Rapport noemt aandachts­punten,
              geen advies.
            </li>
            <li>
              <strong>Tenant-grens</strong>: deze pilot draait op env-allowlist;
              v2 vervangt dit door <code>OrgMembership</code> + DB-resolver
              zonder UI-rewrite.
            </li>
          </ul>
        </div>
      </Section>

      <div>
        <Button asChild variant="outline" size="sm">
          <Link href={"/advisor/clients" as never}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Terug naar cliëntenlijst
          </Link>
        </Button>
      </div>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/60 bg-surface/40">
      <CardContent className="space-y-1 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className="font-mono text-base font-bold text-foreground">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
