import type { Route } from "next";
import Link from "next/link";
import { Plus, ShieldAlert, Target } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { GoalCard } from "@/components/goals/goal-card";
import { Button } from "@/components/ui/button";
import { loadGoalsForUser } from "@/lib/analytics/goals";
import { resolveUserFromServer } from "@/lib/auth";

export const metadata = {
  title: "Financiële doelen",
};

export const dynamic = "force-dynamic";

/**
 * /doelen — overzicht van alle actieve doelen.
 *
 * Layout: grid van GoalCard's. Bovenaan een CTA "Nieuw doel".
 * Empty state wanneer er nog geen doelen zijn.
 */

export default async function DoelenPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Doelen"
          title="Financiële doelen"
          description="Authenticatie vereist."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }

  const result = await loadGoalsForUser({ userEmail: auth.user.email });

  if (result.noUser) {
    return (
      <>
        <PageHeader
          eyebrow="Doelen"
          title="Financiële doelen"
          description="Geen user-context gevonden."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Geen account"
          description="Log opnieuw in om je doelen te zien."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Doelen"
        title="Financiële doelen"
        description="Geef je portefeuille richting — koppel concrete doelen aan je strategie."
        actions={
          <Button asChild>
            <Link href={"/doelen/nieuw" as Route}>
              <Plus className="mr-1 h-4 w-4" aria-hidden /> Nieuw doel
            </Link>
          </Button>
        }
      />

      {result.combined.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Geen doelen ingesteld"
          description="Begin met je eerste doel — pensioen, FIRE, huis kopen, of iets eigens. We rekenen meteen drie scenario's voor je door."
          action={
            <Button asChild>
              <Link href={"/doelen/nieuw" as Route}>Stel je eerste doel in</Link>
            </Button>
          }
        />
      ) : (
        <Section
          title={`${result.combined.length} ${result.combined.length === 1 ? "doel" : "doelen"}`}
          description="Klik door op een doel voor de volledige projectie + scenarios + verbeteradviezen."
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {result.combined.map(({ goal, projection }) => (
              <GoalCard key={goal.id} goal={goal} projection={projection} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
