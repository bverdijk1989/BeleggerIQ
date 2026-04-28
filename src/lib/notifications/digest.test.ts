import { describe, expect, it } from "vitest";

import { buildWeeklyDigest } from "./digest";
import type { NotificationEvent } from "./events";

const EVENT = (
  o: Partial<NotificationEvent> & {
    type: NotificationEvent["type"];
    title?: string;
  },
): NotificationEvent => ({
  userId: "u1",
  key: `${o.type}:k`,
  type: o.type,
  severity: o.severity ?? "informational",
  title: o.title ?? "Test event",
  body: o.body ?? "",
  context: o.context ?? {},
  occurredAt: o.occurredAt ?? "2026-04-25T00:00:00.000Z",
});

describe("buildWeeklyDigest", () => {
  it("levert ALTIJD 5 bullets, ook bij lege input", () => {
    const r = buildWeeklyDigest({
      weekLabel: "21-04 – 27-04",
      events: [],
    });
    expect(r.bullets).toHaveLength(5);
    expect(r.bullets.map((b) => b.label)).toEqual([
      "Portefeuille",
      "Risico",
      "Marktregime",
      "Watchlist",
      "Volgende actie",
    ]);
  });

  it("portfolio-delta wordt cijfermatig weergegeven", () => {
    const r = buildWeeklyDigest({
      weekLabel: "wk",
      events: [],
      portfolio: {
        startValue: 100_000,
        endValue: 102_500,
        baseCurrency: "EUR",
      },
    });
    const portfolioBullet = r.bullets.find((b) => b.label === "Portefeuille")!;
    expect(portfolioBullet.detail).toMatch(/\+2\.5%/);
  });

  it("FRAGILE_CONCENTRATION → next action verwijst naar trim van de ticker", () => {
    const r = buildWeeklyDigest({
      weekLabel: "wk",
      events: [
        EVENT({
          type: "FRAGILE_CONCENTRATION",
          severity: "critical",
          context: { ticker: "ASML" },
        }),
      ],
    });
    expect(r.nextAction).toMatch(/Trim ASML/);
  });

  it("multiple watchlist alerts worden gecombineerd in één bullet", () => {
    const r = buildWeeklyDigest({
      weekLabel: "wk",
      events: [
        EVENT({ type: "WATCHLIST_PRICE_ALERT", context: { ticker: "AAPL" } }),
        EVENT({ type: "WATCHLIST_PRICE_ALERT", context: { ticker: "TSLA" } }),
        EVENT({ type: "WATCHLIST_PRICE_ALERT", context: { ticker: "NVDA" } }),
      ],
    });
    const wl = r.bullets.find((b) => b.label === "Watchlist")!;
    expect(wl.detail).toMatch(/3 prijssignaal/);
    expect(wl.detail).toMatch(/AAPL/);
    expect(wl.detail).toMatch(/TSLA/);
  });

  it("regimeStatus override wordt overgenomen", () => {
    const r = buildWeeklyDigest({
      weekLabel: "wk",
      events: [],
      regimeStatus: "RECESSION (wisseling deze week)",
    });
    const regime = r.bullets.find((b) => b.label === "Marktregime")!;
    expect(regime.detail).toBe("RECESSION (wisseling deze week)");
  });

  it("zonder events + zonder portfolio → geen exception, lege-state-tekst", () => {
    const r = buildWeeklyDigest({ weekLabel: "wk", events: [] });
    expect(r.bullets[0]?.detail).toMatch(/Geen waardering/);
    expect(r.bullets[1]?.detail).toMatch(/Geen nieuwe risk-flags/);
    expect(r.nextAction).toMatch(/Niets dringends/);
  });
});
