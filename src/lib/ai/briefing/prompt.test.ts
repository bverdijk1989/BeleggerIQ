import { describe, expect, it } from "vitest";

import { makeBriefingContext } from "./fixtures";
import { BRIEFING_SYSTEM_PROMPT, buildBriefingPrompt } from "./prompt";
import { BRIEFING_SECTION_ORDER } from "./types";

describe("buildBriefingPrompt", () => {
  it("system-prompt benoemt hedged-language regels", () => {
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/overweeg/i);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/let op/i);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/mogelijk risico/i);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/gegarandeerd|garandeer/i);
  });

  it("system-prompt benoemt 5-lens (Buffett/Dalio/Lynch)", () => {
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/Buffett/);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/Dalio/);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/Lynch/);
  });

  it("system-prompt verbiedt verzonnen cijfers", () => {
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/UITSLUITEND.*CONTEXT/i);
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/(verzin|invent)/i);
  });

  it("user-prompt embedt de volledige context als JSON", () => {
    const ctx = makeBriefingContext();
    const prompt = buildBriefingPrompt(ctx);
    expect(prompt.user).toContain("ASML");
    expect(prompt.user).toContain("0.18"); // largestPositionWeight
    expect(prompt.user).toContain("```json");
  });

  it("user-prompt vermeldt alle 7 section-keys in canonical volgorde in de bullet-lijst", () => {
    const ctx = makeBriefingContext();
    const prompt = buildBriefingPrompt(ctx);
    // De bullets zien er uit als `- portfolio_movement (Portefeuille…)`.
    // Zoek met dat exacte prefix zodat we voorbij de JSON-context kijken.
    let lastIdx = -1;
    for (const key of BRIEFING_SECTION_ORDER) {
      const idx = prompt.user.indexOf(`- ${key} `);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it("user-prompt vermeldt briefing-datum + base currency", () => {
    const ctx = makeBriefingContext({
      briefingDate: "2026-12-31",
      baseCurrency: "USD",
    });
    const prompt = buildBriefingPrompt(ctx);
    expect(prompt.user).toContain("2026-12-31");
    expect(prompt.user).toContain("USD");
  });
});
