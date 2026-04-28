import { BookOpen, UserCog } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Profiel",
};

export default function ProfielPage() {
  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="Beleggersprofiel"
        description="Je horizon, risicobereidheid, doelen en voorkeuren sturen alle analyses en beslissingen aan."
        actions={<Button size="sm">Profiel bewerken</Button>}
      />

      <Section title="Overzicht" description="Deze gegevens bepalen hoe BeleggerIQ signalen voor jou weegt.">
        <EmptyState
          icon={UserCog}
          title="Nog geen profiel ingesteld"
          description="Start de profielwizard om je horizon, risicobereidheid en doelen vast te leggen."
          action={<Button size="sm">Profielwizard starten</Button>}
        />
      </Section>

      <Section
        title="Hoe weegt BeleggerIQ jouw profiel?"
        description="Methodologie van alle engines: factor scoring, regime, risk, rebalance en de monthly buy."
      >
        <a
          href="/methodologie"
          className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-surface/60 px-4 py-3 text-sm hover:border-primary/40"
        >
          <BookOpen className="h-4 w-4 text-primary" />
          <span>
            <strong className="text-foreground">Methodologie & engines</strong>
            <span className="ml-2 text-muted-foreground">
              — formules, thresholds en limitations
            </span>
          </span>
        </a>
      </Section>
    </>
  );
}
