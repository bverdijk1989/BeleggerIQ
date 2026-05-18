import {
  Download,
  FileText,
  ListChecks,
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
import { PaywallCard } from "@/components/entitlements/paywall-card";
import { resolveUserFromServer } from "@/lib/auth";
import {
  canUseFeature,
  getFeature,
  resolveCurrentTier,
} from "@/lib/entitlements";

export const metadata = {
  title: "Advisor PDF-rapport",
};

export const dynamic = "force-dynamic";

/**
 * /advisor/report — landings-pagina voor het Advisor PDF Report MVP (Module 23).
 *
 * Toont entitlement-status, een korte preview van wat het rapport bevat,
 * en twee CTA's:
 *  - "Open in browser" → /api/advisor/report (inline, browser → Ctrl/⌘+P)
 *  - "Direct downloaden" → /api/advisor/report?download=1
 *
 * Entitlement: `report.advisor_pdf` (Elite + Advisor).
 */
export default async function AdvisorReportPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Advisor"
          title="Advisor PDF-rapport"
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
  const entitlement = canUseFeature(tierResult.tier, "report.advisor_pdf", {
    overrideActive: tierResult.overrideActive,
  });

  if (!entitlement.allowed) {
    const feature = getFeature("report.advisor_pdf")!;
    return (
      <>
        <PageHeader
          eyebrow="Advisor"
          title="Advisor PDF-rapport"
          description="Een client-ready portefeuillecheck in 10 secties — beschikbaar in Elite en Advisor."
        />
        <Section
          title="Wat krijg je in dit rapport?"
          description="Een professioneel one-document overzicht dat je naar jezelf, een vermogensbeheerder of fiscalist kunt sturen."
        >
          <PreviewGrid />
          <PaywallCard
            featureLabel={feature.label}
            description={feature.description}
            entitlement={entitlement}
            bonusCopy="Print-friendly HTML met browser-naar-PDF; alle disclaimers en datakwaliteit-coverage transparant. Geen koop/verkoop-orders, alleen meetbare aandachtspunten."
          />
        </Section>
      </>
    );
  }

  // Entitled — toon downloadknoppen.
  return (
    <>
      <PageHeader
        eyebrow="Advisor"
        title="Advisor PDF-rapport"
        description="Genereer een client-ready portefeuillecheck. Open of download als HTML — gebruik daarna Ctrl/⌘ + P om als PDF op te slaan."
        actions={
          <Badge variant="outline" className="text-[10px]">
            {tierResult.tier}
          </Badge>
        }
      />

      <Section
        title="Wat zit erin?"
        description="Tien secties die samen een volledig portefeuillebeeld geven."
      >
        <PreviewGrid />
      </Section>

      <Section
        title="Genereer rapport"
        description="Het rapport wordt on-demand opgebouwd uit je huidige portefeuille-data. Geen koop/verkoop-aanbevelingen — alleen meetbare aandachtspunten."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="space-y-3 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Printer className="h-4 w-4 text-primary" />
                Open in browser
              </p>
              <p className="text-xs text-muted-foreground">
                Bekijk het rapport en gebruik daarna <kbd>Ctrl</kbd> /{" "}
                <kbd>⌘</kbd> + <kbd>P</kbd> → &quot;Opslaan als PDF&quot;.
                Geen extra tools nodig.
              </p>
              <Button asChild size="sm" className="w-full sm:w-auto">
                <Link href={"/api/advisor/report" as never} target="_blank">
                  Open rapport
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="space-y-3 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Download className="h-4 w-4 text-primary" />
                Direct downloaden (HTML)
              </p>
              <p className="text-xs text-muted-foreground">
                Voor archivering of mailen aan de cliënt — open het bestand
                in een browser en print naar PDF.
              </p>
              <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                <Link
                  href={"/api/advisor/report?download=1" as never}
                  target="_blank"
                >
                  Download .html
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section
        title="Hoe werkt dit?"
        description="Bewuste keuzes voor v1."
      >
        <div className="rounded-md border border-border/60 bg-surface/40 p-4 text-xs text-muted-foreground">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>HTML-renderer eerst</strong> — print-friendly via A4 +
              browser-PDF. Geen native PDF-deps in v1; v2 voegt server-side
              Puppeteer/pdfmake toe zonder breaking change in data-shape.
            </li>
            <li>
              <strong>Tien secties</strong>: titel, disclaimer, health,
              risico, spreiding, doelen, scenarios, behavioral,
              datakwaliteit, actiepunten.
            </li>
            <li>
              <strong>Geen koop/verkoop-orders</strong> — actiepunten zijn
              aandachtspunten met bron-engine voor traceability.
            </li>
            <li>
              <strong>White-label-ready</strong> — branding-config wordt
              uitgebreid in v2 (advisor-firma instellingen).
            </li>
          </ul>
        </div>
      </Section>
    </>
  );
}

function PreviewGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <PreviewItem
        icon={ShieldCheck}
        label="Health + risico"
        body="Score 0-100, top-5 risk-flags, kerngegevens (top-positie, vola, FX-exposure)."
      />
      <PreviewItem
        icon={FileText}
        label="Spreiding + doelen"
        body="Asset-class, sector, regio, valuta. Doelvoortgang per goal (haalbaar/at-risk)."
      />
      <PreviewItem
        icon={ListChecks}
        label="Scenarios + actiepunten"
        body="9 stress-scenarios met worst-case. Top-5 actiepunten in gewone taal — geen orders."
      />
    </div>
  );
}

function PreviewItem({
  icon: Icon,
  label,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  body: string;
}) {
  return (
    <Card className="border-border/60 bg-surface/40">
      <CardContent className="space-y-2 p-4">
        <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <Icon className="h-3 w-3" /> {label}
        </p>
        <p className="text-xs text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}
