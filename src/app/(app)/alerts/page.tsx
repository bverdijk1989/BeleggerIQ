import { Bell, ShieldAlert } from "lucide-react";

import { AlertPreferencesForm } from "@/components/alerts/alert-preferences-form";
import { AlertRow } from "@/components/alerts/alert-row";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Section } from "@/components/common/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { markAllAlertsReadAction } from "@/lib/alerts/actions";
import { parseAlertPreferences } from "@/lib/alerts/preferences";
import { resolveUserFromServer } from "@/lib/auth";
import { alertRepository, portfolioRepository } from "@/lib/data";

export const metadata = {
  title: "Notificaties",
};

export const dynamic = "force-dynamic";

/**
 * /alerts — notification center.
 *
 * Drie secties:
 *  1. ACTIVE (UNREAD + READ) gesorteerd op occurredAt desc
 *  2. DISMISSED (collapsed achter een knop)
 *  3. Voorkeuren — per type aan/uit + min-severity
 */

export default async function AlertsPage() {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return (
      <>
        <PageHeader
          eyebrow="Notificaties"
          title="Alerts"
          description="Authenticatie vereist."
        />
        <EmptyState icon={ShieldAlert} title="Niet ingelogd" description={auth.error} />
      </>
    );
  }

  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) {
    return (
      <>
        <PageHeader
          eyebrow="Notificaties"
          title="Alerts"
          description="Geen user-context."
        />
        <EmptyState
          icon={ShieldAlert}
          title="Geen account"
          description="Log opnieuw in om je notificaties te zien."
        />
      </>
    );
  }

  const [active, dismissed] = await Promise.all([
    alertRepository.list({ userId: ctx.userId, includeDismissed: false, limit: 100 }),
    alertRepository.list({ userId: ctx.userId, status: "DISMISSED", limit: 50 }),
  ]);

  const unread = active.filter((a) => a.status === "UNREAD");
  const read = active.filter((a) => a.status === "READ");

  const prefs = parseAlertPreferences(
    (ctx.profile?.preferences as Record<string, unknown> | undefined)?.alerts,
  );

  async function markAll() {
    "use server";
    await markAllAlertsReadAction();
  }

  return (
    <>
      <PageHeader
        eyebrow="Notificaties"
        title="Alerts"
        description="Relevante signalen op je portefeuille — geen spam, alleen meetbare triggers."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {unread.length} ongelezen
            </Badge>
            {unread.length > 0 && (
              <form action={markAll}>
                <Button size="sm" type="submit">
                  Markeer alles als gelezen
                </Button>
              </form>
            )}
          </div>
        }
      />

      <Section
        title={`Ongelezen (${unread.length})`}
        description="Recent gegenereerd, nog niet bekeken."
      >
        {unread.length === 0 ? (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm text-emerald-200">
            <p className="flex items-center gap-2">
              <Bell className="h-4 w-4" aria-hidden />
              Geen ongelezen notificaties — alles is bekeken.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {unread.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </div>
        )}
      </Section>

      {read.length > 0 && (
        <Section
          title={`Gelezen (${read.length})`}
          description="Eerder bekeken — blijven zichtbaar tot je ze negeert."
        >
          <div className="space-y-3">
            {read.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </div>
        </Section>
      )}

      {dismissed.length > 0 && (
        <Section
          title={`Genegeerd (${dismissed.length})`}
          description="Bewust opzijgezet — kun je altijd opnieuw activeren."
        >
          <div className="space-y-3">
            {dismissed.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Voorkeuren"
        description="Wat wil je wel/niet zien? Per type aan/uit + minimum-severity. Buffett-laag: minder ruis = betere beslissingen."
      >
        <AlertPreferencesForm preferences={prefs} />
      </Section>
    </>
  );
}
