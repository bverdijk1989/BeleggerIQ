import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/data";

import type {
  NotificationEvent,
  NotificationEventType,
} from "./events";

/**
 * Repository-laag voor `NotificationDelivery`.
 *
 * Twee primaire operaties:
 *
 *   - **`reserve`** — schrijft een PENDING-rij voor een event-key, mits
 *     er nog geen rij is. Retourneert `created=true` voor "we mogen
 *     versturen", `false` voor "al een keer gedaan, sla over". De
 *     unique-constraint op (userId, key) is de daadwerkelijke
 *     idempotentie-grens.
 *
 *   - **`markSent`** / **`markFailed`** — flip status na een delivery
 *     attempt. Failures bumpen `attempts` zodat een retry-job 'em later
 *     opnieuw kan oppakken (out-of-scope voor v1).
 */

export interface ReserveInput {
  event: NotificationEvent;
  /** Volledig gerenderde payload (subject + text + optionele html). */
  rendered: { subject: string; text: string; html?: string };
  channel?: "EMAIL" | "ALERT_LOG";
  /** Sluit deze reservation aan een digest-run. */
  digestRunId?: string | null;
}

export interface ReserveResult {
  /** True wanneer er een nieuwe rij is geschreven (= mag versturen). */
  created: boolean;
  /** Id van de delivery-rij (zowel bij created=true als false). */
  id: string;
}

export const notificationRepository = {
  /**
   * Probeer een delivery-rij te reserveren voor (userId, key). Bij
   * conflict (al bestaand) returnen we de bestaande id zonder mutation —
   * caller weet dan dat 'ie niet nogmaals moet versturen.
   */
  async reserve(input: ReserveInput): Promise<ReserveResult> {
    const { event } = input;
    try {
      const row = await prisma.notificationDelivery.create({
        data: {
          userId: event.userId,
          eventType: event.type,
          key: event.key,
          channel: input.channel ?? "EMAIL",
          status: "PENDING",
          payload: input.rendered as unknown as Prisma.InputJsonValue,
          context: event.context as unknown as Prisma.InputJsonValue,
          digestRunId: input.digestRunId ?? null,
        },
        select: { id: true },
      });
      return { created: true, id: row.id };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        const existing = await prisma.notificationDelivery.findUnique({
          where: {
            userId_key: { userId: event.userId, key: event.key },
          },
          select: { id: true },
        });
        return { created: false, id: existing?.id ?? "" };
      }
      throw err;
    }
  },

  async markSent(id: string): Promise<void> {
    if (!id) return;
    await prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  },

  async markSentAsDigest(ids: string[], digestRunId: string): Promise<void> {
    if (ids.length === 0) return;
    await prisma.notificationDelivery.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "SENT_AS_DIGEST",
        sentAt: new Date(),
        digestRunId,
      },
    });
  },

  async markFailed(id: string, error: string): Promise<void> {
    if (!id) return;
    await prisma.notificationDelivery.update({
      where: { id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        lastError: error.slice(0, 500),
      },
    });
  },

  async markSuppressed(id: string): Promise<void> {
    if (!id) return;
    await prisma.notificationDelivery.update({
      where: { id },
      data: { status: "SUPPRESSED_BY_PREFERENCE" },
    });
  },

  /**
   * Zoek alle PENDING/SENT events voor een user binnen een tijds-bereik —
   * gebruikt door de digest-builder.
   */
  async findRecentForDigest(input: {
    userId: string;
    since: Date;
    until: Date;
  }): Promise<
    Array<{
      id: string;
      eventType: NotificationEventType;
      payload: { subject: string; text: string };
      context: Record<string, unknown> | null;
      createdAt: Date;
    }>
  > {
    const rows = await prisma.notificationDelivery.findMany({
      where: {
        userId: input.userId,
        createdAt: { gte: input.since, lt: input.until },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType as NotificationEventType,
      payload: r.payload as unknown as { subject: string; text: string },
      context:
        r.context && typeof r.context === "object"
          ? (r.context as Record<string, unknown>)
          : null,
      createdAt: r.createdAt,
    }));
  },
};
