import { UserCog } from "lucide-react";

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
    </>
  );
}
