import { describe, expect, it, vi } from "vitest";

import { dispatchInstantAlerts } from "./dispatcher";
import type { NotificationEvent } from "./events";
import {
  DEFAULT_PREFERENCES,
  type NotificationPreferences,
} from "./preferences";

interface CapturedReservation {
  event: NotificationEvent;
  rendered: { subject: string; text: string };
  id: string;
  status: "PENDING" | "SENT" | "SUPPRESSED" | "FAILED";
}

function fakeStore() {
  const reservations: CapturedReservation[] = [];
  return {
    reservations,
    async reserve({
      event,
      rendered,
    }: {
      event: NotificationEvent;
      rendered: { subject: string; text: string };
    }) {
      // dedup op (userId, key)
      const existing = reservations.find(
        (r) => r.event.userId === event.userId && r.event.key === event.key,
      );
      if (existing) return { created: false, id: existing.id };
      const id = `res-${reservations.length + 1}`;
      reservations.push({ event, rendered, id, status: "PENDING" });
      return { created: true, id };
    },
    async markSent(id: string) {
      const r = reservations.find((x) => x.id === id);
      if (r) r.status = "SENT";
    },
    async markFailed(id: string) {
      const r = reservations.find((x) => x.id === id);
      if (r) r.status = "FAILED";
    },
    async markSuppressed(id: string) {
      const r = reservations.find((x) => x.id === id);
      if (r) r.status = "SUPPRESSED";
    },
  };
}

const event = (o: Partial<NotificationEvent> & { type: NotificationEvent["type"]; key: string }): NotificationEvent => ({
  userId: "u1",
  severity: o.severity ?? "critical",
  title: o.title ?? "x",
  body: o.body ?? "y",
  context: o.context ?? {},
  occurredAt: o.occurredAt ?? "2026-04-28T00:00:00Z",
  ...o,
});

describe("dispatchInstantAlerts", () => {
  it("verstuurt 1 mail per nieuw event en markeert als SENT", async () => {
    const store = fakeStore();
    const mailer = vi.fn(async () => {});
    const r = await dispatchInstantAlerts({
      email: "u@e.nl",
      prefs: DEFAULT_PREFERENCES,
      events: [event({ type: "REGIME_SWITCH", key: "REGIME_SWITCH:u1:d:a:b" })],
      store,
      mailer,
    });
    expect(r.sent).toBe(1);
    expect(mailer).toHaveBeenCalledTimes(1);
    expect(store.reservations[0]?.status).toBe("SENT");
  });

  it("dezelfde key tweede keer → géén tweede mail (dedup)", async () => {
    const store = fakeStore();
    const mailer = vi.fn(async () => {});
    const e = event({
      type: "REGIME_SWITCH",
      key: "REGIME_SWITCH:u1:d:a:b",
    });
    await dispatchInstantAlerts({
      email: "u@e.nl",
      prefs: DEFAULT_PREFERENCES,
      events: [e],
      store,
      mailer,
    });
    const r = await dispatchInstantAlerts({
      email: "u@e.nl",
      prefs: DEFAULT_PREFERENCES,
      events: [e],
      store,
      mailer,
    });
    expect(r.duplicates).toBe(1);
    expect(r.sent).toBe(0);
    expect(mailer).toHaveBeenCalledTimes(1);
  });

  it("prefs.instantCriticalAlerts=false → critical event SUPPRESSED, mail niet verstuurd", async () => {
    const store = fakeStore();
    const mailer = vi.fn(async () => {});
    const prefs: NotificationPreferences = {
      ...DEFAULT_PREFERENCES,
      instantCriticalAlerts: false,
    };
    const r = await dispatchInstantAlerts({
      email: "u@e.nl",
      prefs,
      events: [event({ type: "FRAGILE_CONCENTRATION", key: "k1" })],
      store,
      mailer,
    });
    expect(r.suppressed).toBe(1);
    expect(r.sent).toBe(0);
    expect(mailer).not.toHaveBeenCalled();
    expect(store.reservations[0]?.status).toBe("SUPPRESSED");
  });

  it("prefs.watchlistAlerts=false → watchlist event SUPPRESSED maar critical events GAAN GEWOON DOOR", async () => {
    const store = fakeStore();
    const mailer = vi.fn(async () => {});
    const prefs: NotificationPreferences = {
      ...DEFAULT_PREFERENCES,
      watchlistAlerts: false,
    };
    const r = await dispatchInstantAlerts({
      email: "u@e.nl",
      prefs,
      events: [
        event({ type: "WATCHLIST_PRICE_ALERT", key: "wl1", severity: "informational" }),
        event({ type: "REGIME_SWITCH", key: "rg1", severity: "critical" }),
      ],
      store,
      mailer,
    });
    expect(r.suppressed).toBe(1);
    expect(r.sent).toBe(1);
    expect(mailer).toHaveBeenCalledTimes(1);
  });

  it("mailer faalt → status=FAILED + counter klopt", async () => {
    const store = fakeStore();
    const mailer = vi.fn(async () => {
      throw new Error("smtp down");
    });
    const r = await dispatchInstantAlerts({
      email: "u@e.nl",
      prefs: DEFAULT_PREFERENCES,
      events: [event({ type: "REGIME_SWITCH", key: "k1" })],
      store,
      mailer,
    });
    expect(r.failed).toBe(1);
    expect(store.reservations[0]?.status).toBe("FAILED");
  });
});
