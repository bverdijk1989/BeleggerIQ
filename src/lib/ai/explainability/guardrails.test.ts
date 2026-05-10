import { describe, expect, it } from "vitest";

import { validateExplanationOutput } from "./guardrails";

const VALID = JSON.stringify({
  summary: "Score 78/100 — overweeg te kijken naar ASML.",
  whyItMatters: "Mogelijk relevant gegeven concentratie. Let op hedged taal.",
  positives: ["ROIC 22% — sterke kapitaal-efficiëntie."],
  risks: ["Mogelijk kwetsbaar bij sectorshock."],
  possibleActions: [
    {
      title: "Overweeg een trim",
      rationale: "Single-name fout werkt mogelijk disproportioneel.",
    },
  ],
  uncertainties: ["Sentiment-data ontbreekt — interpreteer met marge."],
});
const CTX_JSON = JSON.stringify({ score: 78, roic: 0.22 });

describe("validateExplanationOutput — happy path", () => {
  it("valide JSON + hedged + cijfers in context → ok", () => {
    const result = validateExplanationOutput(VALID, CTX_JSON);
    expect(result.ok).toBe(true);
    expect(result.draft).not.toBeNull();
    expect(result.draft?.positives).toHaveLength(1);
  });

  it("strip markdown-fence", () => {
    const wrapped = "```json\n" + VALID + "\n```";
    expect(validateExplanationOutput(wrapped, CTX_JSON).ok).toBe(true);
  });
});

describe("validateExplanationOutput — rejection cases", () => {
  it("invalid JSON → reject", () => {
    const result = validateExplanationOutput("nope", CTX_JSON);
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe("json-parse-failed");
  });

  it("missing summary → reject", () => {
    const broken = JSON.stringify({
      whyItMatters: "x",
      positives: [],
      risks: [],
      possibleActions: [],
      uncertainties: [],
    });
    const result = validateExplanationOutput(broken, CTX_JSON);
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toMatch(/summary/);
  });

  it("invalid action shape → reject", () => {
    const broken = JSON.stringify({
      summary: "Overweeg.",
      whyItMatters: "Belangrijk.",
      positives: ["mogelijk goed"],
      risks: ["let op"],
      possibleActions: [{ title: "Doe iets" }], // missing rationale
      uncertainties: ["mogelijk"],
    });
    const result = validateExplanationOutput(broken, CTX_JSON);
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe("invalid-actions");
  });

  it("banned phrase 'gegarandeerd' → reject", () => {
    const banned = JSON.stringify({
      summary: "Gegarandeerd hoger.",
      whyItMatters: "Het is mogelijk.",
      positives: [],
      risks: [],
      possibleActions: [],
      uncertainties: ["mogelijk geen"],
    });
    const result = validateExplanationOutput(banned, CTX_JSON);
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe("banned-phrase");
  });

  it("ontbrekende hedged-language → reject", () => {
    const noHedge = JSON.stringify({
      summary: "Score 78/100. Doe X.",
      whyItMatters: "Het is belangrijk.",
      positives: ["ROIC 22%."],
      risks: ["Sectorshock."],
      possibleActions: [{ title: "Trim", rationale: "Concentratie hoog." }],
      uncertainties: ["Geen data."],
    });
    const result = validateExplanationOutput(noHedge, CTX_JSON);
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe("hedged-language-missing");
  });

  it("verzonnen cijfer → reject", () => {
    const fab = JSON.stringify({
      summary: "Score 99,9% — overweeg te kijken.",
      whyItMatters: "Mogelijk relevant.",
      positives: ["mogelijk."],
      risks: ["mogelijk."],
      possibleActions: [{ title: "Overweeg", rationale: "Mogelijk." }],
      uncertainties: ["Mogelijk geen data."],
    });
    const result = validateExplanationOutput(fab, CTX_JSON);
    expect(result.ok).toBe(false);
    expect(result.rejectionReason).toBe("numeric-claim-rejected");
    expect(result.rejectedClaims).toContain("99,9%");
  });
});
