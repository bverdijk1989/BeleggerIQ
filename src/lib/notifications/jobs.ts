/**
 * Job runners voor notifications.
 *
 * Twee primaire runs:
 *
 *   - `runInstantAlertsForUser`   wordt door een snapshot-job (of een
 *     onChange-hook in de cockpit) aangeroepen. Detecteert nieuwe risk-
 *     flags / cap-overschrijdingen / regime-switches / watchlist-prijs-
 *     hits en stuurt de critical-alerts direct.
 *
 *   - `runWeeklyDigest`           draait vrijdagavond. Pakt alle events
 *     van de afgelopen 7 dagen voor elke user, bouwt een 5-bullet
 *     samenvatting + portfolio-delta, stuurt 'em.
 *
 * Concrete cron-wiring (systemd-timer / GitHub Actions / Vercel Cron)
 * is operator-keuze. Deze module is platform-agnostisch en async-friendly.
 */

import { sendMail } from "@/lib/mail/provider";
import {
  portfolioRepository,
  prisma,
} from "@/lib/data";

import { dispatchInstantAlerts } from "./dispatcher";
import { buildWeeklyDigest } from "./digest";
import {
  categoryOf,
  type NotificationEvent,
} from "./events";
import { isCategoryAllowed, parsePreferences } from "./preferences";
import { notificationRepository } from "./repository";
import { renderDigestEmail, renderEventEmail } from "./templates";

export interface RunUserAlertsInput {
  userId: string;
  email: string;
  events: NotificationEvent[];
  appUrl?: string;
}

/**
 * Loop de events voor één user door, met preferences + idempotency.
 * Wrapper rond dispatcher die de Prisma-store inhangt.
 */
export async function runInstantAlertsForUser(
  input: RunUserAlertsInput,
) {
  const profile = await prisma.userProfile.findUnique({
    where: { userId: input.userId },
    select: { notifications: true },
  });
  const prefs = parsePreferences(profile?.notifications);

  return dispatchInstantAlerts({
    email: input.email,
    prefs,
    events: input.events,
    appUrl: input.appUrl,
    store: {
      reserve: (i) => notificationRepository.reserve(i),
      markSent: (id) => notificationRepository.markSent(id),
      markFailed: (id, e) => notificationRepository.markFailed(id, e),
      markSuppressed: (id) => notificationRepository.markSuppressed(id),
    },
  });
}

// ============================================================
//  Weekly digest runner
// ============================================================

export interface RunWeeklyDigestOptions {
  /** Wanneer is "nu"? Default = Date.now(). */
  now?: Date;
  /** Test-hook om mailer te injecteren. */
  mailer?: typeof sendMail;
  /** Override appUrl (default uit env). */
  appUrl?: string;
}

export interface DigestRunResult {
  users: number;
  digestsSent: number;
  digestsSkipped: number;
}

function weekRange(now: Date): { since: Date; until: Date; label: string } {
  const until = new Date(now);
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // Locale-friendly week-label voor in de subject.
  const fmt = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const label = `${fmt(since)} – ${fmt(until)}`;
  return { since, until, label };
}

export async function runWeeklyDigest(
  options: RunWeeklyDigestOptions = {},
): Promise<DigestRunResult> {
  const now = options.now ?? new Date();
  const send = options.mailer ?? sendMail;
  const appUrl = options.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const range = weekRange(now);
  const digestRunId = `digest-${range.until.toISOString()}`;

  const result: DigestRunResult = {
    users: 0,
    digestsSent: 0,
    digestsSkipped: 0,
  };

  const users = await prisma.user.findMany({
    select: { id: true, email: true, profile: { select: { notifications: true } } },
  });

  for (const user of users) {
    result.users += 1;
    const prefs = parsePreferences(user.profile?.notifications);
    if (!isCategoryAllowed(prefs, "digest")) {
      result.digestsSkipped += 1;
      continue;
    }

    const recent = await notificationRepository.findRecentForDigest({
      userId: user.id,
      since: range.since,
      until: range.until,
    });

    // Hydrate als NotificationEvent shape voor de digest-builder.
    const events: NotificationEvent[] = recent.map((r) => ({
      type: r.eventType,
      key: `${r.eventType}:${r.id}`,
      severity:
        r.eventType === "FRAGILE_CONCENTRATION" ||
        r.eventType === "REGIME_SWITCH" ||
        r.eventType === "POSITION_CAP_EXCEEDED"
          ? "critical"
          : "informational",
      userId: user.id,
      title: r.payload.subject.replace(/^\[(Actie|Update)\]\s*/, ""),
      body: r.payload.text,
      context: r.context ?? {},
      occurredAt: r.createdAt.toISOString(),
    }));

    const portfolioDelta = await loadPortfolioWeekDelta({
      userEmail: user.email,
      since: range.since,
      until: range.until,
    });

    const digest = buildWeeklyDigest({
      weekLabel: range.label,
      events,
      portfolio: portfolioDelta,
    });
    const rendered = renderDigestEmail({
      ...digest,
      appUrl,
    });

    try {
      await send({
        to: user.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      // Markeer instant-events als digest-verstuurd zodat ze niet
      // alsnog losse alerts triggeren.
      await notificationRepository.markSentAsDigest(
        recent.map((r) => r.id),
        digestRunId,
      );
      result.digestsSent += 1;
    } catch {
      // Skip user; volgende digest-tick probeert opnieuw.
      result.digestsSkipped += 1;
    }
  }

  return result;
}

interface PortfolioDeltaArgs {
  userEmail: string;
  since: Date;
  until: Date;
}

async function loadPortfolioWeekDelta(args: PortfolioDeltaArgs) {
  const portfolio = await portfolioRepository
    .findPrimaryByEmail(args.userEmail)
    .catch(() => null);
  if (!portfolio) return null;
  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: {
      portfolioId: portfolio.id,
      capturedAt: { gte: args.since, lte: args.until },
    },
    orderBy: { capturedAt: "asc" },
  });
  if (snapshots.length === 0) return null;
  const start = snapshots[0]!;
  const end = snapshots[snapshots.length - 1]!;
  return {
    startValue: Number(start.totalValue),
    endValue: Number(end.totalValue),
    baseCurrency: portfolio.baseCurrency,
  };
}

// Re-export voor convenience aan callers.
export { renderEventEmail };
