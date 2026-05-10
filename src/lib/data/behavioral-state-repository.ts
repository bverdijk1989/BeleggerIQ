import {
  type BehavioralWarningState as PrismaState,
  type BehavioralWarningStatus as PrismaStatus,
} from "@prisma/client";

import { prisma } from "./prisma";

import type {
  BehavioralStatus,
  BehavioralWarningState,
} from "@/lib/analytics/behavioral";

/**
 * Repository voor `BehavioralWarningState`. Server-only.
 *
 * Pattern is bewust simpel: één rij per (user, signalId), upsert bij
 * elke status-mutatie. De engine genereert signalen elke pageload
 * deterministisch — deze tabel houdt alleen de gebruiker-keuze bij.
 *
 * **Snooze-semantiek**: bij `status=SNOOZED` met `snoozedUntil < now`
 * behandelt de loader het signaal weer als ACTIVE. Geen housekeeping-
 * job nodig; de status mag in de DB SNOOZED blijven tot user 'em
 * expliciet opnieuw negeert.
 */

const STATUS_MAP_TO_DOMAIN: Record<PrismaStatus, BehavioralStatus> = {
  ACTIVE: "ACTIVE",
  DISMISSED: "DISMISSED",
  SNOOZED: "SNOOZED",
};

const STATUS_MAP_TO_PRISMA: Record<BehavioralStatus, PrismaStatus> = {
  ACTIVE: "ACTIVE",
  DISMISSED: "DISMISSED",
  SNOOZED: "SNOOZED",
};

function rowToDomain(row: PrismaState): BehavioralWarningState {
  return {
    userId: row.userId,
    signalId: row.signalId,
    status: STATUS_MAP_TO_DOMAIN[row.status],
    snoozedUntil: row.snoozedUntil ?? null,
    reasonNote: row.reasonNote ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const behavioralStateRepository = {
  async listForUser(userId: string): Promise<BehavioralWarningState[]> {
    const rows = await prisma.behavioralWarningState.findMany({
      where: { userId },
    });
    return rows.map(rowToDomain);
  },

  async upsertStatus(input: {
    userId: string;
    signalId: string;
    status: BehavioralStatus;
    snoozedUntil?: Date | null;
    reasonNote?: string | null;
  }): Promise<BehavioralWarningState> {
    const status = STATUS_MAP_TO_PRISMA[input.status];
    const row = await prisma.behavioralWarningState.upsert({
      where: {
        userId_signalId: {
          userId: input.userId,
          signalId: input.signalId,
        },
      },
      update: {
        status,
        snoozedUntil: input.snoozedUntil ?? null,
        reasonNote: input.reasonNote ?? null,
      },
      create: {
        userId: input.userId,
        signalId: input.signalId,
        status,
        snoozedUntil: input.snoozedUntil ?? null,
        reasonNote: input.reasonNote ?? null,
      },
    });
    return rowToDomain(row);
  },

  async resetToActive(input: {
    userId: string;
    signalId: string;
  }): Promise<void> {
    await prisma.behavioralWarningState
      .delete({
        where: {
          userId_signalId: {
            userId: input.userId,
            signalId: input.signalId,
          },
        },
      })
      .catch(() => {
        // Geen rij = al ACTIVE; no-op.
      });
  },
};
