/**
 * Dispatcher — combineert event-flow met preferences + idempotency +
 * mail-delivery.
 *
 * **Geen Prisma-imports** in deze module — alle DB-toegang loopt via
 * een `NotificationStore`-port die je in tests kunt mocken. Reden: zo
 * kan het volledige policy-pad (preference → reserve → render → send)
 * deterministisch getest worden zonder DB-fixtures.
 */

import { sendMail, type SendMailInput } from "@/lib/mail/provider";

import {
  categoryOf,
  type NotificationEvent,
} from "./events";
import {
  isCategoryAllowed,
  type NotificationPreferences,
} from "./preferences";
import { renderEventEmail, type RenderedEmail } from "./templates";

export interface NotificationStore {
  reserve(input: {
    event: NotificationEvent;
    rendered: RenderedEmail;
  }): Promise<{ created: boolean; id: string }>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
  markSuppressed(id: string): Promise<void>;
}

export interface DispatchInput {
  email: string;
  prefs: NotificationPreferences;
  events: NotificationEvent[];
  store: NotificationStore;
  appUrl?: string;
  /** Test-only: injecteer een mailer i.p.v. de globale provider. */
  mailer?: (input: SendMailInput) => Promise<void>;
}

export interface DispatchResult {
  attempted: number;
  sent: number;
  duplicates: number;
  suppressed: number;
  failed: number;
}

export async function dispatchInstantAlerts(
  input: DispatchInput,
): Promise<DispatchResult> {
  const result: DispatchResult = {
    attempted: 0,
    sent: 0,
    duplicates: 0,
    suppressed: 0,
    failed: 0,
  };

  const send = input.mailer ?? sendMail;

  for (const event of input.events) {
    result.attempted += 1;

    const category = categoryOf(event.type);
    const allowed = isCategoryAllowed(input.prefs, category);

    const rendered = renderEventEmail(event, { appUrl: input.appUrl });
    const reservation = await input.store.reserve({ event, rendered });

    if (!reservation.created) {
      // Duplicate — eerder al gezien voor deze key.
      result.duplicates += 1;
      continue;
    }

    if (!allowed) {
      // Reservation aangemaakt voor audit-trail, maar niet verzenden.
      await input.store.markSuppressed(reservation.id);
      result.suppressed += 1;
      continue;
    }

    try {
      await send({
        to: input.email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });
      await input.store.markSent(reservation.id);
      result.sent += 1;
    } catch (err) {
      await input.store.markFailed(
        reservation.id,
        err instanceof Error ? err.message : String(err),
      );
      result.failed += 1;
    }
  }

  return result;
}
