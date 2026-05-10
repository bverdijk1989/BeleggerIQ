import { describe, expect, it } from "vitest";

import { makeBriefingContext } from "./fixtures";
import {
  decideMode,
  draftToSections,
  validateBriefingOutput,
} from "./guardrails";
import { BRIEFING_SECTION_ORDER } from "./types";

const VALID_AI_OUTPUT = JSON.stringify({
  headline: "Portefeuille licht hoger; let op concentratie ASML.",
  sections: [
    {
      key: "portfolio_movement",
      body: "Portefeuille beweegt; overweeg lange-termijnbeeld boven dagschommeling.",
      dataAvailable: true,
    },
    {
      key: "winners_losers",
      body: "ASML staat sterk; let op dat dit geen voorspelling is.",
      dataAvailable: true,
    },
    {
      key: "risks",
      body: "Mogelijk risico op single-name bij ASML — overweeg trim.",
      dataAvailable: true,
    },
    {
      key: "macro",
      body: "Regime is neutraal; mogelijk gebalanceerde tilt past.",
      dataAvailable: true,
    },
    {
      key: "earnings_news",
      body: "Geen feed beschikbaar — sectie blijft leeg.",
      dataAvailable: false,
    },
    {
      key: "concentration_volatility",
      body: "Sector Technology weegt zwaar; let op correlatie.",
      dataAvailable: true,
    },
    {
      key: "focus_action",
      body: "Overweeg ASML te trimmen volgens engine-suggestie.",
      dataAvailable: true,
    },
  ],
  focusAction: "Overweeg ASML te trimmen volgens engine-suggestie.",
});

describe("validateBriefingOutput — happy path", () => {
  it("valide AI-output passeert alle guardrails", () => {
    const ctx = makeBriefingContext();
    const result = validateBriefingOutput(VALID_AI_OUTPUT, ctx);
    expect(result.ok).toBe(true);
    expect(result.draft).not.toBeNull();
    expect(result.draft?.sections).toHaveLength(7);
  });

  it("decideMode → 'ai' bij ok", () => {
    const ctx = makeBriefingContext();
    const result = validateBriefingOutput(VALID_AI_OUTPUT, ctx);
    expect(decideMode(result)).toBe("ai");
  });

  it("draftToSections vult labels in en sorteert canonical", () => {
    const ctx = makeBriefingContext();
    const result = validateBriefingOutput(VALID_AI_OUTPUT, ctx);
    const sections = draftToSections(result.draft!);
    expect(sections.map((s) => s.key)).toEqual([...BRIEFING_SECTION_ORDER]);
    for (const s of sections) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("strip markdown-code-fences voordat parse", () => {
    const wrapped = "```json\n" + VALID_AI_OUTPUT + "\n```";
    const ctx = makeBriefingContext();
    const result = validateBriefingOutput(wrapped, ctx);
    expect(result.ok).toBe(true);
  });
});

describe("validateBriefingOutput — rejection cases", () => {
  it("invalid JSON → reject", () => {
    const result = validateBriefingOutput("dit is geen json", makeBriefingContext());
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe("json-parse-failed");
  });

  it("missing headline → reject", () => {
    const broken = JSON.stringify({ sections: [], focusAction: "x" });
    const result = validateBriefingOutput(broken, makeBriefingContext());
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toMatch(/headline/);
  });

  it("invalid section key → reject", () => {
    const broken = JSON.stringify({
      headline: "Overweeg dit te lezen.",
      focusAction: "Overweeg trim.",
      sections: [
        {
          key: "invalid_key",
          body: "Overweeg iets.",
          dataAvailable: true,
        },
      ],
    });
    const result = validateBriefingOutput(broken, makeBriefingContext());
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toMatch(/section-invalid-key/);
  });

  it("banned phrase 'gegarandeerd' → reject", () => {
    const banned = JSON.stringify({
      headline: "Gegarandeerd hoger eind dit jaar.",
      focusAction: "Trim ASML.",
      sections: BRIEFING_SECTION_ORDER.map((k) => ({
        key: k,
        body: "Overweeg vandaag.",
        dataAvailable: true,
      })),
    });
    const result = validateBriefingOutput(banned, makeBriefingContext());
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe("banned-phrase");
    expect(result.bannedPhrases?.[0]).toMatch(/gegarandeerd/i);
  });

  it("banned phrase 'koersdoel' → reject", () => {
    const banned = JSON.stringify({
      headline: "Koersdoel ASML €1500.",
      focusAction: "Overweeg.",
      sections: BRIEFING_SECTION_ORDER.map((k) => ({
        key: k,
        body: "Overweeg vandaag.",
        dataAvailable: true,
      })),
    });
    const result = validateBriefingOutput(banned, makeBriefingContext());
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe("banned-phrase");
  });

  it("ontbrekende hedged-language → reject", () => {
    const noHedge = JSON.stringify({
      headline: "Portefeuille hoger vandaag.",
      focusAction: "Verkoop ASML.",
      sections: BRIEFING_SECTION_ORDER.map((k) => ({
        key: k,
        body: "Verkoop ASML nu.",
        dataAvailable: true,
      })),
    });
    const result = validateBriefingOutput(noHedge, makeBriefingContext());
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe("hedged-language-missing");
  });

  it("verzonnen cijfer dat niet in context staat → reject", () => {
    const fabricated = JSON.stringify({
      headline: "Portefeuille +99,4% sinds gisteren — overweeg te checken.",
      focusAction: "Overweeg trim.",
      sections: BRIEFING_SECTION_ORDER.map((k) => ({
        key: k,
        body: "Overweeg de cijfers.",
        dataAvailable: true,
      })),
    });
    const result = validateBriefingOutput(fabricated, makeBriefingContext());
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe("numeric-claim-rejected");
    expect(result.rejectedClaims).toContain("99,4%");
  });

  it("decideMode → 'fallback' bij rejection", () => {
    const result = validateBriefingOutput("invalid", makeBriefingContext());
    expect(decideMode(result)).toBe("fallback");
  });
});

describe("draftToSections — vult ontbrekende secties", () => {
  it("ontbrekende sectie wordt aangevuld met 'Geen data beschikbaar'", () => {
    const partial = JSON.stringify({
      headline: "Overweeg.",
      focusAction: "Overweeg.",
      sections: [
        {
          key: "portfolio_movement",
          body: "Overweeg het beeld.",
          dataAvailable: true,
        },
      ],
    });
    const result = validateBriefingOutput(partial, makeBriefingContext());
    expect(result.ok).toBe(true);
    const sections = draftToSections(result.draft!);
    expect(sections).toHaveLength(7);
    const filled = sections.filter((s) => s.dataAvailable);
    expect(filled.length).toBeGreaterThanOrEqual(1);
    const empty = sections.filter((s) => !s.dataAvailable);
    expect(empty.length).toBeGreaterThanOrEqual(1);
  });
});
