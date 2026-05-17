import { describe, expect, it } from "vitest";

import { getMicrocopy } from "./microcopy";
import {
  DEFAULT_UX_MODE,
  getDashboardVisibility,
  getVisibleNavRoutes,
  isRouteVisibleInMode,
} from "./types";
import type { UxMode } from "@/types/profile";

describe("getDashboardVisibility — strict subset relations", () => {
  it("BEGINNER toont strikt minder secties dan FOCUS", () => {
    const beginner = getDashboardVisibility("BEGINNER");
    const focus = getDashboardVisibility("FOCUS");
    let beginnerSet = 0;
    let focusSet = 0;
    for (const key of Object.keys(beginner) as Array<
      keyof typeof beginner
    >) {
      if (beginner[key]) beginnerSet++;
      if (focus[key]) focusSet++;
    }
    expect(beginnerSet).toBeLessThan(focusSet);
  });

  it("FOCUS toont strikt minder secties dan EXPERT", () => {
    const focus = getDashboardVisibility("FOCUS");
    const expert = getDashboardVisibility("EXPERT");
    let focusSet = 0;
    let expertSet = 0;
    for (const key of Object.keys(focus) as Array<keyof typeof focus>) {
      if (focus[key]) focusSet++;
      if (expert[key]) expertSet++;
    }
    expect(focusSet).toBeLessThan(expertSet);
  });

  it("EXPERT toont alle secties (alle visibility-flags true behalve microcopy)", () => {
    const expert = getDashboardVisibility("EXPERT");
    expect(expert.showAiExplain).toBe(true);
    expect(expert.showAllocationPreview).toBe(true);
    expect(expert.showScenarioSnapshot).toBe(true);
    expect(expert.showBusinessQuality).toBe(true);
    expect(expert.showHistoryCharts).toBe(true);
    expect(expert.showDecisionHistory).toBe(true);
    // Educational microcopy is alleen BEGINNER:
    expect(expert.showEducationalMicrocopy).toBe(false);
  });

  it("BEGINNER toont educatieve microcopy", () => {
    const beginner = getDashboardVisibility("BEGINNER");
    expect(beginner.showEducationalMicrocopy).toBe(true);
  });

  it("FOCUS heeft geen educational microcopy", () => {
    const focus = getDashboardVisibility("FOCUS");
    expect(focus.showEducationalMicrocopy).toBe(false);
  });

  it("alle 3 modi tonen primary action + status + health", () => {
    for (const mode of ["BEGINNER", "FOCUS", "EXPERT"] as UxMode[]) {
      const v = getDashboardVisibility(mode);
      expect(v.showPrimaryAction).toBe(true);
      expect(v.showStatusSnapshot).toBe(true);
      expect(v.showHealthScoreCard).toBe(true);
    }
  });

  it("null/undefined → DEFAULT_UX_MODE config", () => {
    expect(getDashboardVisibility(null)).toEqual(
      getDashboardVisibility(DEFAULT_UX_MODE),
    );
    expect(getDashboardVisibility(undefined)).toEqual(
      getDashboardVisibility(DEFAULT_UX_MODE),
    );
  });
});

describe("getVisibleNavRoutes — modus-filter", () => {
  it("BEGINNER bevat /dashboard + /portfolio + /portfolio-health + /doelen + /coach + /profiel", () => {
    const r = getVisibleNavRoutes("BEGINNER");
    expect(r).toContain("/dashboard");
    expect(r).toContain("/portfolio");
    expect(r).toContain("/portfolio-health");
    expect(r).toContain("/doelen");
    expect(r).toContain("/coach");
    expect(r).toContain("/profiel");
  });

  it("BEGINNER bevat GEEN expert-routes (backtest, strategy-lab, screener, score, kansen)", () => {
    const r = getVisibleNavRoutes("BEGINNER");
    expect(r).not.toContain("/backtest");
    expect(r).not.toContain("/strategy-lab");
    expect(r).not.toContain("/screener");
    expect(r).not.toContain("/score");
    expect(r).not.toContain("/kansen");
  });

  it("FOCUS bevat dashboard + briefing + risico + macro + maandbeslissing", () => {
    const r = getVisibleNavRoutes("FOCUS");
    expect(r).toContain("/briefing");
    expect(r).toContain("/risico");
    expect(r).toContain("/macro");
    expect(r).toContain("/maandbeslissing");
  });

  it("FOCUS bevat GEEN strategy-lab / backtest / screener", () => {
    const r = getVisibleNavRoutes("FOCUS");
    expect(r).not.toContain("/strategy-lab");
    expect(r).not.toContain("/backtest");
    expect(r).not.toContain("/screener");
  });

  it("EXPERT bevat alle hoofdroutes inclusief screener + backtest + strategy-lab + chat", () => {
    const r = getVisibleNavRoutes("EXPERT");
    expect(r).toContain("/screener");
    expect(r).toContain("/backtest");
    expect(r).toContain("/strategy-lab");
    expect(r).toContain("/chat");
    expect(r).toContain("/score");
  });
});

describe("isRouteVisibleInMode", () => {
  it("/dashboard in alle modi", () => {
    expect(isRouteVisibleInMode("/dashboard", "BEGINNER")).toBe(true);
    expect(isRouteVisibleInMode("/dashboard", "FOCUS")).toBe(true);
    expect(isRouteVisibleInMode("/dashboard", "EXPERT")).toBe(true);
  });

  it("/strategy-lab alleen in EXPERT", () => {
    expect(isRouteVisibleInMode("/strategy-lab", "BEGINNER")).toBe(false);
    expect(isRouteVisibleInMode("/strategy-lab", "FOCUS")).toBe(false);
    expect(isRouteVisibleInMode("/strategy-lab", "EXPERT")).toBe(true);
  });

  it("onbekende route → false", () => {
    expect(isRouteVisibleInMode("/non-existent", "EXPERT")).toBe(false);
  });
});

describe("getMicrocopy", () => {
  it("BEGINNER → niet-lege uitleg per sectie", () => {
    expect(getMicrocopy("health", "BEGINNER").length).toBeGreaterThan(0);
    expect(getMicrocopy("goals", "BEGINNER").length).toBeGreaterThan(0);
    expect(getMicrocopy("briefing", "BEGINNER").length).toBeGreaterThan(0);
  });

  it("FOCUS → lege string", () => {
    expect(getMicrocopy("health", "FOCUS")).toBe("");
  });

  it("EXPERT → lege string", () => {
    expect(getMicrocopy("health", "EXPERT")).toBe("");
  });

  it("null/undefined → lege string", () => {
    expect(getMicrocopy("health", null)).toBe("");
    expect(getMicrocopy("health", undefined)).toBe("");
  });
});

// ============================================================
//  Module 4 spec-conformiteit — expliciete mapping spec → flags
// ============================================================

describe("Module 4 spec-conformiteit", () => {
  it("BEGINNER: simpele uitleg + educatieve microcopy + focus doelen/score/risico", () => {
    const v = getDashboardVisibility("BEGINNER");
    // Spec: educatieve microcopy
    expect(v.showEducationalMicrocopy).toBe(true);
    // Spec: focus op doelen + score + risico
    expect(v.showGoals).toBe(true);
    expect(v.showHealthScoreCard).toBe(true);
    expect(v.showBehavioralCoach).toBe(true);
    // Spec: geen complexe factor-tabellen standaard
    expect(v.showConfidenceSummary).toBe(false);
    // Spec: weinig grafieken
    expect(v.showHistoryCharts).toBe(false);
    expect(v.showMacroRegime).toBe(false);
  });

  it("FOCUS: AI briefing + Health + top risico + maandactie", () => {
    const v = getDashboardVisibility("FOCUS");
    // Spec onderdelen
    expect(v.showBriefing).toBe(true);
    expect(v.showHealthScoreCard).toBe(true);
    expect(v.showRiskActions).toBe(true);
    expect(v.showMacroRegime).toBe(true); // maandactie-context
    // Niet alle expert-secties
    expect(v.showConfidenceSummary).toBe(false);
    expect(v.showDeepDive).toBe(false);
    expect(v.showEducationalMicrocopy).toBe(false);
  });

  it("EXPERT: volledige analytics, factor breakdowns, backtesting, macro, risk, signal details", () => {
    const v = getDashboardVisibility("EXPERT");
    expect(v.showAllocationPreview).toBe(true);
    expect(v.showScenarioSnapshot).toBe(true);
    expect(v.showAiExplain).toBe(true);
    expect(v.showMacroRegime).toBe(true);
    expect(v.showConfidenceSummary).toBe(true);
    expect(v.showDecisionHistory).toBe(true);
    expect(v.showDeepDive).toBe(true);
    expect(v.showBusinessQuality).toBe(true);
    expect(v.showNetReturn).toBe(true);
    expect(v.showHistoryCharts).toBe(true);
    expect(v.showEducationalMicrocopy).toBe(false);
  });

  it("Routes: BEGINNER mist analytische routes", () => {
    expect(isRouteVisibleInMode("/macro", "BEGINNER")).toBe(false);
    expect(isRouteVisibleInMode("/backtest", "BEGINNER")).toBe(false);
    expect(isRouteVisibleInMode("/strategy-lab", "BEGINNER")).toBe(false);
    expect(isRouteVisibleInMode("/screener", "BEGINNER")).toBe(false);
    // Wel: doelen, health, coach (spec-kern)
    expect(isRouteVisibleInMode("/doelen", "BEGINNER")).toBe(true);
    expect(isRouteVisibleInMode("/portfolio-health", "BEGINNER")).toBe(true);
    expect(isRouteVisibleInMode("/coach", "BEGINNER")).toBe(true);
  });

  it("Routes: FOCUS heeft maandactie + macro, geen expert-routes", () => {
    expect(isRouteVisibleInMode("/maandbeslissing", "FOCUS")).toBe(true);
    expect(isRouteVisibleInMode("/macro", "FOCUS")).toBe(true);
    expect(isRouteVisibleInMode("/strategy-lab", "FOCUS")).toBe(false);
    expect(isRouteVisibleInMode("/backtest", "FOCUS")).toBe(false);
  });

  it("Routes: EXPERT toont alles", () => {
    expect(isRouteVisibleInMode("/strategy-lab", "EXPERT")).toBe(true);
    expect(isRouteVisibleInMode("/backtest", "EXPERT")).toBe(true);
    expect(isRouteVisibleInMode("/screener", "EXPERT")).toBe(true);
    expect(isRouteVisibleInMode("/macro", "EXPERT")).toBe(true);
  });

  it("EXPERT toont strikt ⊇ FOCUS (geen flag wel in FOCUS maar niet in EXPERT)", () => {
    const focus = getDashboardVisibility("FOCUS");
    const expert = getDashboardVisibility("EXPERT");
    const keys = Object.keys(focus) as Array<keyof typeof focus>;
    for (const key of keys) {
      if (key === "showEducationalMicrocopy") continue;
      if (focus[key]) expect(expert[key]).toBe(true);
    }
  });

  it("DEFAULT_UX_MODE is FOCUS (spec: 'minimaal-maar-bruikbaar')", () => {
    expect(DEFAULT_UX_MODE).toBe("FOCUS");
  });
});
