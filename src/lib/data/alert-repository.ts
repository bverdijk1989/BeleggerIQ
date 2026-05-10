import {
  type Alert as PrismaAlert,
  type AlertSeverity as PrismaSeverity,
  type AlertStatus as PrismaStatus,
  type AlertType as PrismaType,
  Prisma,
} from "@prisma/client";

import { prisma } from "./prisma";

import type {
  Alert,
  AlertCandidate,
  AlertSeverity,
  AlertStatus,
  AlertType,
} from "@/lib/alerts/types";

/**
 * Repository voor `Alert`. Server-only.
 *
 * Idempotency-laag: `upsert` op (userId, dedupeKey) zodat dezelfde
 * gebeurtenis tweemaal triggeren één rij oplevert, niet twee. Bij conflict
 * worden alleen `body` en `severity` ge-update — `status` en
 * read/dismiss-state mogen NIET geraakt worden door de engine; alleen
 * door user-acties.
 */

function rowToDomain(row: PrismaAlert): Alert {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as AlertType,
    severity: row.severity as AlertSeverity,
    status: row.status as AlertStatus,
    dedupeKey: row.dedupeKey,
    title: row.title,
    body: row.body,
    context:
      row.context && typeof row.context === "object" && !Array.isArray(row.context)
        ? (row.context as Record<string, unknown>)
        : undefined,
    link: row.link ?? undefined,
    occurredAt: row.occurredAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface ListAlertsFilter {
  userId: string;
  /** Default: niet DISMISSED (voor notification-center). */
  includeDismissed?: boolean;
  status?: AlertStatus;
  limit?: number;
}

export const alertRepository = {
  async list(filter: ListAlertsFilter): Promise<Alert[]> {
    const where: Prisma.AlertWhereInput = { userId: filter.userId };
    if (filter.status) {
      where.status = filter.status as PrismaStatus;
    } else if (!filter.includeDismissed) {
      where.status = { in: ["UNREAD", "READ"] as PrismaStatus[] };
    }
    const rows = await prisma.alert.findMany({
      where,
      orderBy: [{ status: "asc" }, { occurredAt: "desc" }],
      take: filter.limit ?? 50,
    });
    return rows.map(rowToDomain);
  },

  async unreadCount(userId: string): Promise<number> {
    return prisma.alert.count({
      where: { userId, status: "UNREAD" as PrismaStatus },
    });
  },

  /**
   * Idempotent persist van candidates voor één user. Returns het aantal
   * nieuwe rijen (ge-upsert) — voor logging/diagnostics.
   *
   * Bij conflict: title/body/severity worden ge-update (engine kan
   * verfijnde tekst leveren bij latere run); status + read/dismiss
   * blijven onaangeroerd.
   */
  async persistCandidates(
    userId: string,
    candidates: ReadonlyArray<AlertCandidate>,
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const c of candidates) {
      try {
        await prisma.alert.create({
          data: {
            userId,
            type: c.type as PrismaType,
            severity: c.severity as PrismaSeverity,
            status: "UNREAD",
            dedupeKey: c.dedupeKey,
            title: c.title,
            body: c.body,
            context:
              (c.context as unknown as Prisma.InputJsonValue | undefined) ??
              undefined,
            link: c.link ?? null,
            occurredAt: new Date(c.occurredAt),
          },
        });
        created += 1;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          await prisma.alert.update({
            where: { userId_dedupeKey: { userId, dedupeKey: c.dedupeKey } },
            data: {
              severity: c.severity as PrismaSeverity,
              title: c.title,
              body: c.body,
              context:
                (c.context as unknown as Prisma.InputJsonValue | undefined) ??
                undefined,
              link: c.link ?? null,
            },
          });
          updated += 1;
          continue;
        }
        throw err;
      }
    }
    return { created, updated };
  },

  async markRead(userId: string, alertId: string): Promise<void> {
    await prisma.alert
      .updateMany({
        where: { id: alertId, userId, status: "UNREAD" as PrismaStatus },
        data: { status: "READ", readAt: new Date() },
      })
      .catch(() => undefined);
  },

  async markAllRead(userId: string): Promise<number> {
    const r = await prisma.alert.updateMany({
      where: { userId, status: "UNREAD" as PrismaStatus },
      data: { status: "READ", readAt: new Date() },
    });
    return r.count;
  },

  async dismiss(userId: string, alertId: string): Promise<void> {
    await prisma.alert
      .updateMany({
        where: { id: alertId, userId },
        data: { status: "DISMISSED", dismissedAt: new Date() },
      })
      .catch(() => undefined);
  },

  async undismiss(userId: string, alertId: string): Promise<void> {
    await prisma.alert
      .updateMany({
        where: { id: alertId, userId },
        data: { status: "READ", dismissedAt: null },
      })
      .catch(() => undefined);
  },
};
