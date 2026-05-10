import { describe, expect, it } from "vitest";

import { renderDeterministicBriefing } from "./deterministic";
import { makeBriefingContext } from "./fixtures";
import { BRIEFING_SECTION_ORDER } from "./types";

describe("renderDeterministicBriefing — happy path", () => {
  it("levert 7 secties in canonical volgorde", () => {
    const out = renderDeterministicBriefing(makeBriefingContext());
    expect(out.sections.map((s) => s.key)).toEqual([...BRIEFING_SECTION_ORDER]);
  });

  it("headline bevat portefeuille-waarde", () => {
    const out = renderDeterministicBriefing(makeBriefingContext());
    expect(out.headline).toMatch(/portefeuille/i);
    expect(out.headline).toMatch(/€\s?100/); // €100… in nl-NL formatting
  });

  it("alle bodies gebruiken hedged taal of zijn dataloos", () => {
    const out = renderDeterministicBriefing(makeBriefingContext());
    for (const s of out.sections) {
      if (!s.dataAvailable) continue;
      expect(s.body.length).toBeGreaterThan(0);
    }
    const allText = out.sections.map((s) => s.body).join(" ");
    expect(allText.toLowerCase()).toMatch(/(overweeg|let op|mogelijk|kan)/);
  });

  it("focusAction-sectie matcht het top-level focusAction veld", () => {
    const out = renderDeterministicBriefing(makeBriefingContext());
    const focus = out.sections.find((s) => s.key === "focus_action");
    expect(focus).toBeDefined();
    expect(out.focusAction).toBe(focus?.body);
  });
});

describe("renderDeterministicBriefing — geen data", () => {
  it("geen snapshots → portfolio_movement.dataAvailable=false", () => {
    const ctx = makeBriefingContext({
      movement: {
        dayChangePct: null,
        weekChangePct: null,
        monthChangePct: null,
        sincePurchasePct: null,
      },
    });
    const out = renderDeterministicBriefing(ctx);
    const move = out.sections.find((s) => s.key === "portfolio_movement");
    expect(move?.dataAvailable).toBe(false);
  });

  it("geen winners/losers → winners_losers.dataAvailable=false", () => {
    const ctx = makeBriefingContext({
      winnersLosers: { winners: [], losers: [] },
    });
    const out = renderDeterministicBriefing(ctx);
    const wl = out.sections.find((s) => s.key === "winners_losers");
    expect(wl?.dataAvailable).toBe(false);
  });

  it("geen regime → macro.dataAvailable=false met disclaimer-zin", () => {
    const ctx = makeBriefingContext({ macro: null });
    const out = renderDeterministicBriefing(ctx);
    const macro = out.sections.find((s) => s.key === "macro");
    expect(macro?.dataAvailable).toBe(false);
    expect(macro?.body.toLowerCase()).toContain("regime");
  });

  it("earnings_news altijd false zolang feed niet aangesloten is", () => {
    const out = renderDeterministicBriefing(makeBriefingContext());
    const en = out.sections.find((s) => s.key === "earnings_news");
    expect(en?.dataAvailable).toBe(false);
  });

  it("geen risks → 'geen acute risico's' positieve formulering", () => {
    const ctx = makeBriefingContext({ risks: [] });
    const out = renderDeterministicBriefing(ctx);
    const risks = out.sections.find((s) => s.key === "risks");
    expect(risks?.dataAvailable).toBe(true);
    expect(risks?.body.toLowerCase()).toMatch(/geen acute|let op/);
  });

  it("geen focus-action → vervangende generieke aanmoediging", () => {
    const ctx = makeBriefingContext({ focusAction: null });
    const out = renderDeterministicBriefing(ctx);
    const f = out.sections.find((s) => s.key === "focus_action");
    expect(f?.dataAvailable).toBe(true);
    expect(f?.body.toLowerCase()).toMatch(/(overweeg|methodologie|review)/);
  });
});

describe("renderDeterministicBriefing — concentratie/volatiliteit thresholds", () => {
  it("low concentration → 'binnen normale ranges'", () => {
    const ctx = makeBriefingContext({
      concentration: {
        largestPositionTicker: "ASML",
        largestPositionWeight: 0.05,
        largestSectorLabel: "Tech",
        largestSectorWeight: 0.10,
        portfolioVolatility: 0.12,
        maxDrawdown: 0.05,
      },
    });
    const out = renderDeterministicBriefing(ctx);
    const cv = out.sections.find((s) => s.key === "concentration_volatility");
    expect(cv?.body.toLowerCase()).toMatch(/normale ranges|periodieke/);
  });

  it("high concentration → expliciete waarschuwing met %", () => {
    const ctx = makeBriefingContext({
      concentration: {
        largestPositionTicker: "ASML",
        largestPositionWeight: 0.32,
        largestSectorLabel: "Tech",
        largestSectorWeight: 0.55,
        portfolioVolatility: 0.32,
        maxDrawdown: 0.28,
      },
    });
    const out = renderDeterministicBriefing(ctx);
    const cv = out.sections.find((s) => s.key === "concentration_volatility");
    expect(cv?.body).toMatch(/32\.0%|55\.0%|let op/i);
  });
});
