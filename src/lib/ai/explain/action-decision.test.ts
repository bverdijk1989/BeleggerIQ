import { describe, expect, it } from "vitest";

import type {
  ActionDecision,
  ActionUrgency,
  PositionAction,
} from "@/lib/analytics/actions";

import { explainActionDecision } from "./action-decision";
import {
  buildActionDecisionPrompt,
  validateExplanationAgainstAction,
} from "./prompt";

const NOW = "2026-04-25T00:00:00.000Z";

function action(
  overrides: Partial<PositionAction> & {
    action?: ActionDecision;
    urgency?: ActionUrgency;
  } = {},
): PositionAction {
  return {
    symbol: overrides.symbol ?? "ASML",
    name: overrides.name ?? "ASML Holding",
    action: overrides.action ?? "TRIM",
    urgency: overrides.urgency ?? "MEDIUM",
    sharesToBuy: overrides.sharesToBuy ?? 0,
    sharesToSell: overrides.sharesToSell ?? 4,
    amount: overrides.amount ?? 7000,
    rationale:
      overrides.rationale ??
      "Gewicht 31% ligt boven de policy-cap van 10%.",
    riskImpact:
      overrides.riskImpact ??
      "Verlaagt single-name concentratie; vrijgekomen cash kan herbelegd worden.",
    sources: overrides.sources ?? ["policy-engine", "rebalance-engine"],
    confidence: overrides.confidence ?? 0.75,
    quantityPlan: overrides.quantityPlan,
  };
}

describe("explainActionDecision — basis", () => {
  it("genereert headline + secties uit engine-output", () => {
    const r = explainActionDecision({ action: action(), now: NOW });
    expect(r.symbol).toBe("ASML");
    expect(r.action).toBe("TRIM");
    expect(r.headline).toMatch(/4 stuks/);
    expect(r.headline).toMatch(/ASML/);
    expect(r.whyLogical.length).toBeGreaterThan(0);
    expect(r.risks.length).toBeGreaterThan(0);
    expect(r.whatCanGoWrong.length).toBeGreaterThan(0);
    expect(r.disclaimer).toMatch(/geen koop- of verkoopadvies/i);
  });

  it("BUY pad: headline noemt sharesToBuy + bedrag", () => {
    const r = explainActionDecision({
      action: action({
        action: "BUY",
        urgency: "LOW",
        sharesToBuy: 5,
        sharesToSell: 0,
        amount: 1500,
      }),
      now: NOW,
    });
    expect(r.headline).toMatch(/5 stuks/);
    expect(r.action).toBe("BUY");
  });

  it("HOLD pad: alleen verb + ticker", () => {
    const r = explainActionDecision({
      action: action({
        action: "HOLD",
        urgency: "LOW",
        sharesToBuy: 0,
        sharesToSell: 0,
        amount: 0,
      }),
      now: NOW,
    });
    expect(r.headline).toMatch(/aan te houden/);
    expect(r.whatCanGoWrong.length).toBeGreaterThan(0);
  });

  it("DO_NOTHING pad krijgt eigen 'wat kan misgaan'-bullets", () => {
    const r = explainActionDecision({
      action: action({ action: "DO_NOTHING", urgency: "LOW", confidence: 0.3 }),
      now: NOW,
    });
    expect(r.action).toBe("DO_NOTHING");
    expect(
      r.whatCanGoWrong.some((b) => /Onvoldoende data/i.test(b)),
    ).toBe(true);
    // Lage confidence → expliciete waarschuwing in risks.
    expect(r.risks.some((b) => /Confidence is 30%/.test(b))).toBe(true);
  });

  it("rationale uit engine wordt letterlijk overgenomen (geen nieuwe cijfers)", () => {
    const r = explainActionDecision({
      action: action({
        rationale: "Gewicht 31% ligt boven cap 10%.",
      }),
      now: NOW,
    });
    expect(r.whyLogical[0]).toBe("Gewicht 31% ligt boven cap 10%.");
  });
});

describe("explainActionDecision — risk-context", () => {
  it("voegt risk-class waarschuwing toe", () => {
    const r = explainActionDecision({
      action: action(),
      positionRisk: { riskClass: "high" } as Parameters<
        typeof explainActionDecision
      >[0]["positionRisk"],
      now: NOW,
    });
    expect(r.risks.some((b) => /high/.test(b))).toBe(true);
  });

  it("voegt low-quality cue toe bij composite < 40", () => {
    const r = explainActionDecision({
      action: action(),
      factorScore: {
        ticker: "ASML",
        asOf: NOW,
        subScores: { quality: 30, value: 50, momentum: 50, lowVol: 50 },
        composite: 28,
        confidence: 0.6,
      },
      now: NOW,
    });
    expect(r.risks.some((b) => /28\/100/.test(b))).toBe(true);
  });
});

describe("explainActionDecision — determinisme", () => {
  it("identieke input → identieke output", () => {
    const input = { action: action(), now: NOW };
    const a = explainActionDecision(input);
    const b = explainActionDecision(input);
    expect(a).toEqual(b);
  });
});

describe("buildActionDecisionPrompt", () => {
  it("system-prompt verbiedt nieuwe cijfers en actie-aanpassing", () => {
    const p = buildActionDecisionPrompt({ action: action(), now: NOW });
    expect(p.system).toMatch(/Verzin geen nieuwe scores/);
    expect(p.system).toMatch(/actie .* NIET aan/);
  });

  it("user-prompt bevat de action als JSON", () => {
    const p = buildActionDecisionPrompt({ action: action(), now: NOW });
    expect(p.user).toContain("ASML");
    expect(p.user).toContain("\"sharesToSell\": 4");
  });
});

describe("validateExplanationAgainstAction", () => {
  it("accepteert tekst zonder cijfers", () => {
    const r = validateExplanationAgainstAction(
      "Een uitleg zonder getallen, alleen kwalitatief commentaar.",
      { action: action() },
    );
    expect(r.ok).toBe(true);
  });

  it("accepteert cijfers die in de input voorkomen", () => {
    const r = validateExplanationAgainstAction(
      "Engine vermeldt 31% boven cap 10%; verkoop 4 stuks voor 7000 EUR.",
      {
        action: action({
          rationale: "Gewicht 31% ligt boven cap 10%.",
          sharesToSell: 4,
          amount: 7000,
        }),
      },
    );
    expect(r.ok).toBe(true);
  });

  it("flag verzonnen percentages", () => {
    const r = validateExplanationAgainstAction(
      "Engine ziet 99% rendement.",
      { action: action() },
    );
    expect(r.ok).toBe(false);
    expect(r.rejectedClaims.some((c) => c.includes("99"))).toBe(true);
  });
});
