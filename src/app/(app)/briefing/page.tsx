import { Newspaper, ShieldAlert, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { loadBriefingForPortfolio } from "@/lib/ai/briefing";
import { resolveUserFromServer } from "@/lib/auth";

export const metadata = {
  title: "Dagelijkse briefing",
};

export const dynamic = "force-dynamic";

/**
 * /briefing — volledige Daily AI Investment Briefing.
 *
 * Toont alle 7 secties van de briefing, plus audit-meta:
 *  - mode (ai/fallback) + provider/model
 *  - confidence-tier + bronnen
 *  - data-limitations
 *  - disclaimer
 *
 * UX: voelt als een persoonlijke analist-memo. Eén-pagina, scanbaar,
 * geen chatbot-interactie.
 */

export default async function BriefingPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Dagelijks"
          title="Dagelijkse briefing"
          description="Authenticatie vereist."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }

  const result = await loadBriefingForPortfolio({ userEmail: auth.user.email });

  if (result.noPortfolio || !result.briefing) {
    return (
      <>
        <PageHeader
          eyebrow="Dagelijks"
          title="Dagelijkse briefing"
          description="Persoonlijke analist-memo over je portefeuille."
        />
        <EmptyState
          icon={Newspaper}
          title="Geen portefeuille"
          description="Maak eerst een portefeuille aan om een briefing te genereren."
        />
      </>
    );
  }

  const briefing = result.briefing;
  const isAi = briefing.mode === "ai";

  return (
    <>
      <PageHeader
        eyebrow="Dagelijks"
        title="Dagelijkse briefing"
        description={`${briefing.briefingDate} · gegenereerd ${formatTime(briefing.generatedAt)}`}
        actions={
          <div className="flex items-center gap-2">
            {isAi && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Sparkles className="h-2.5 w-2.5" aria-hidden />
                AI · {briefing.providerId}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px]">
              Confidence: {briefing.confidenceTier}
            </Badge>
          </div>
        }
      />

      <Section
        title={briefing.headline}
        description="Wat je vandaag écht moet weten — gevolgd door 7 thema-secties."
      >
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Focuspunt vandaag
          </p>
          <p className="mt-1 text-sm text-foreground">{briefing.focusAction}</p>
        </div>
      </Section>

      <Section
        title="Volledige briefing"
        description="Zeven thema's per dag — bewegingen, posities, risico's, macro, nieuws, concentratie, focus."
      >
        <div className="space-y-3">
          {briefing.sections.map((section) => (
            <div
              key={section.key}
              className="rounded-md border border-border/60 bg-surface/40 p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {section.label}
                </h3>
                {!section.dataAvailable && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Beperkte data
                  </Badge>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {section.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Verantwoording"
        description="Welke bronnen zijn gebruikt, welke data ontbrak, en welke disclaimer geldt."
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-border/60 bg-surface/40 p-4 text-xs">
            <h4 className="text-sm font-semibold text-foreground">Bronnen</h4>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {briefing.sources.map((s) => (
                <li key={s}>· {s}</li>
              ))}
            </ul>
            <h4 className="mt-3 text-sm font-semibold text-foreground">
              Beperkingen
            </h4>
            {briefing.dataLimitations.length === 0 ? (
              <p className="mt-1 text-muted-foreground">
                Geen materiële data-beperkingen gemeld.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-muted-foreground">
                {briefing.dataLimitations.map((l, i) => (
                  <li key={i}>· {l}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-xs">
            <h4 className="text-sm font-semibold text-amber-200">Disclaimer</h4>
            <p className="mt-2 text-muted-foreground">{briefing.disclaimer}</p>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Provider: {briefing.providerId} · model {briefing.model} · mode{" "}
              {briefing.mode}
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}
