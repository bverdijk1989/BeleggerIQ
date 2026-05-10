/**
 * GDPR Recht op inzage (AVG art. 15) — server-side data-export.
 *
 * **Filosofie**:
 *  - Geef de gebruiker EEN downloadable JSON met alle persoonlijke data
 *    die we hebben. Geen filter; geen samenvatting; integraal.
 *  - Idempotent — meerdere keren aanroepen levert dezelfde output bij
 *    ongewijzigde DB-state.
 *  - Bevat een "schema-version" zodat we de export-shape later kunnen
 *    evolueren zonder oude tools te breken.
 */

import { prisma } from "@/lib/data/prisma";

export const USER_DATA_EXPORT_SCHEMA_VERSION = 1;

export interface UserDataExport {
  schemaVersion: number;
  generatedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
  profile: Record<string, unknown> | null;
  portfolios: Array<{
    id: string;
    name: string;
    description: string | null;
    baseCurrency: string;
    isPrimary: boolean;
    createdAt: string;
    holdings: Array<Record<string, unknown>>;
  }>;
  transactions: Array<Record<string, unknown>>;
  watchlistItems: Array<Record<string, unknown>>;
  strategyPresets: Array<Record<string, unknown>>;
  decisionSnapshots: Array<Record<string, unknown>>;
  alerts: Array<Record<string, unknown>>;
  financialGoals: Array<Record<string, unknown>>;
  notificationDeliveries: Array<Record<string, unknown>>;
  taxValuations: Array<Record<string, unknown>>;
  auditEntries: Array<Record<string, unknown>>;
}

/**
 * Bouwt de volledige export voor één user. Read-only; geen mutaties.
 *
 * Gebruikt Prisma direct (geen repository-laag) zodat de export-shape
 * onafhankelijk is van domain-mappers — we exporteren rauwe DB-state.
 */
export async function buildUserDataExport(
  userId: string,
): Promise<UserDataExport | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!user) return null;

  const [
    profile,
    portfolios,
    transactions,
    watchlistItems,
    strategyPresets,
    decisionSnapshots,
    alerts,
    financialGoals,
    notificationDeliveries,
    taxValuations,
    auditEntries,
  ] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.portfolio.findMany({
      where: { userId },
      include: { holdings: true },
    }),
    prisma.transaction.findMany({
      where: { portfolio: { userId } },
    }),
    prisma.watchlistItem.findMany({ where: { userId } }),
    prisma.strategyPreset.findMany({ where: { ownerId: userId } }),
    prisma.decisionSnapshot.findMany({ where: { userId } }),
    prisma.alert.findMany({ where: { userId } }),
    prisma.financialGoal.findMany({ where: { userId } }),
    prisma.notificationDelivery.findMany({ where: { userId } }),
    prisma.taxValuation.findMany({
      where: { portfolio: { userId } },
    }),
    prisma.auditEntry.findMany({ where: { userId }, take: 5000 }),
  ]);

  return {
    schemaVersion: USER_DATA_EXPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    },
    profile: profile as unknown as Record<string, unknown> | null,
    portfolios: portfolios.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      baseCurrency: p.baseCurrency,
      isPrimary: p.isPrimary,
      createdAt: p.createdAt.toISOString(),
      holdings: p.holdings.map((h) => ({ ...h })) as Array<
        Record<string, unknown>
      >,
    })),
    transactions: transactions.map((t) => ({ ...t })) as Array<
      Record<string, unknown>
    >,
    watchlistItems: watchlistItems.map((w) => ({ ...w })) as Array<
      Record<string, unknown>
    >,
    strategyPresets: strategyPresets.map((s) => ({ ...s })) as Array<
      Record<string, unknown>
    >,
    decisionSnapshots: decisionSnapshots.map((d) => ({ ...d })) as Array<
      Record<string, unknown>
    >,
    alerts: alerts.map((a) => ({ ...a })) as Array<Record<string, unknown>>,
    financialGoals: financialGoals.map((g) => ({ ...g })) as Array<
      Record<string, unknown>
    >,
    notificationDeliveries: notificationDeliveries.map((n) => ({
      ...n,
    })) as Array<Record<string, unknown>>,
    taxValuations: taxValuations.map((t) => ({ ...t })) as Array<
      Record<string, unknown>
    >,
    auditEntries: auditEntries.map((a) => ({ ...a })) as Array<
      Record<string, unknown>
    >,
  };
}
