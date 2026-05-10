import { ShieldAlert } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { GoalForm } from "@/components/goals/goal-form";
import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import type { Currency } from "@/types/common";

export const metadata = {
  title: "Nieuw doel",
};

export const dynamic = "force-dynamic";

export default async function NieuwDoelPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Doelen"
          title="Nieuw doel"
          description="Authenticatie vereist."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }

  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  const baseCurrency = (ctx?.profile?.baseCurrency ?? "EUR") as Currency;

  return (
    <>
      <PageHeader
        eyebrow="Doelen"
        title="Nieuw doel"
        description="Kies een type, vul je horizon en inleg in. We rekenen direct drie scenario's door zodat je weet wat haalbaar is."
      />
      <Section
        title="Doel-instellingen"
        description="Velden zijn verplicht tenzij anders aangegeven. Verwacht rendement past zich automatisch aan je risicoprofiel aan."
      >
        <GoalForm mode="create" defaultBaseCurrency={baseCurrency} />
      </Section>
    </>
  );
}
