import { Compass, ShieldAlert } from "lucide-react";

import { WarningCard } from "@/components/behavioral/warning-card";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { loadBehavioralCoach } from "@/lib/analytics/behavioral";
import { resolveUserFromServer } from "@/lib/auth";

export const metadata = {
  title: "Behavioral coach",
};

export const dynamic = "force-dynamic";

/**
 * /coach — Behavioral Finance Coach detail-pagina.
 *
 * Drie kolommen-gevoel:
 *  1. Active — wat de gebruiker nu kan reflecteren
 *  2. Snoozed — komt later weer als ACTIVE
 *  3. Dismissed — handmatig genegeerd; user kan reactiveren
 *
 * UX: kalm, niet alarmistisch. Lege ACTIVE-staat = positieve bevestiging.
 */

export default async function BehavioralCoachPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Reflectie"
          title="Behavioral coach"
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

  const result = await loadBehavioralCoach({ userEmail: auth.user.email });

  if (result.noPortfolio) {
    return (
      <>
        <PageHeader
          eyebrow="Reflectie"
          title="Behavioral coach"
          description="Coachende reflectie op gedragspatronen in je portefeuille."
        />
        <EmptyState
          icon={Compass}
          title="Geen portefeuille"
          description="Maak eerst een portefeuille aan voordat de coach patronen kan analyseren."
        />
      </>
    );
  }

  const { active, snoozed, dismissed } = result.partitioned;

  return (
    <>
      <PageHeader
        eyebrow="Reflectie"
        title="Behavioral coach"
        description="Coachende reflectie op 8 gedragspatronen — geen advies, wel vragen die je laten pauzeren."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {active.length} actief · {snoozed.length} snooze ·{" "}
              {dismissed.length} genegeerd
            </Badge>
          </div>
        }
      />

      <Section
        title="Actieve patronen"
        description={
          active.length === 0
            ? "Geen actieve patronen — je portefeuille en strategie lopen synchroon."
            : "Vragen om over te reflecteren — coachend, niet veroordelend."
        }
      >
        {active.length === 0 ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm text-emerald-200">
            <p>
              Geen gedragspatronen die om reflectie vragen. Blijf bewust handelen
              en kom later terug.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {active.map((s) => (
              <WarningCard key={s.id} signal={s} />
            ))}
          </div>
        )}
      </Section>

      {snoozed.length > 0 && (
        <Section
          title="Snooze — keren later terug"
          description="Deze signalen heb je tijdelijk uitgezet. Na de snooze-datum verschijnen ze weer als ACTIVE."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {snoozed.map((s) => (
              <WarningCard key={s.id} signal={s} />
            ))}
          </div>
        </Section>
      )}

      {dismissed.length > 0 && (
        <Section
          title="Genegeerd"
          description="Deze patronen heb je bewust opzijgezet. Je kunt ze altijd opnieuw activeren."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {dismissed.map((s) => (
              <WarningCard key={s.id} signal={s} />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Methodologie"
        description="Welke patronen we meten en waarom."
      >
        <div className="rounded-lg border border-border/60 bg-surface/40 p-4 text-xs text-muted-foreground">
          <p>
            De coach detecteert 8 gedragspatronen op basis van je portefeuille en
            transactiehistorie:{" "}
            <strong className="text-foreground">overconcentratie</strong>,{" "}
            <strong className="text-foreground">overtrading</strong>,{" "}
            <strong className="text-foreground">verkoop na daling</strong>,{" "}
            <strong className="text-foreground">aankoop na stijging (FOMO)</strong>,{" "}
            <strong className="text-foreground">strategy drift</strong>,{" "}
            <strong className="text-foreground">onder-diversificatie</strong>,{" "}
            <strong className="text-foreground">cash-mismatch</strong>,{" "}
            <strong className="text-foreground">performance chasing</strong>.
          </p>
          <p className="mt-2">
            Drempels en formules staan vast (Simons-laag — meetbaar +
            reproduceerbaar) en zijn gemotiveerd in{" "}
            <code className="rounded bg-muted/30 px-1">docs/BEHAVIORAL_COACH.md</code>.
          </p>
          <p className="mt-2">
            <strong className="text-foreground">Toon</strong>: coachend, niet
            betuttelend. We schrijven &ldquo;wijkt af van je strategie — wil je
            deze keuze bewust maken?&rdquo;, niet &ldquo;je hebt fout
            gehandeld&rdquo;.
          </p>
        </div>
      </Section>
    </>
  );
}
