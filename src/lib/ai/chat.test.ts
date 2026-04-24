import { describe, expect, it } from "vitest";

import { detectIntent, buildWelcomeMessage } from "./chat";
import type { ChatContext } from "@/types/chat";

const CTX: ChatContext = {
  portfolio: {
    id: "p1",
    name: "Demo",
    baseCurrency: "EUR",
    totalValue: 10_000,
    positionCount: 8,
    largestPosition: { ticker: "ASML", name: "ASML Holding", weight: 0.18 },
  },
  regime: { stance: "NEUTRAL", score: 52, confidence: 0.8 },
  risk: { severity: "moderate", riskScore: 48, topFlags: [] },
  health: { grade: "B", score: 72, signals: 2 },
  plan: { recommendations: 3, deployed: 600, cashReserved: 400 },
  asOf: "2026-04-01T00:00:00.000Z",
};

describe("detectIntent", () => {
  it("mapt maandkoop-vragen naar buy_plan", () => {
    expect(detectIntent("Wat moet ik deze maand bijkopen?").intent).toBe(
      "buy_plan",
    );
    expect(detectIntent("Help me met mijn maandbeslissing").intent).toBe(
      "buy_plan",
    );
  });

  it("mapt risico-vragen naar portfolio_risks", () => {
    expect(detectIntent("Waar zit mijn grootste risico?").intent).toBe(
      "portfolio_risks",
    );
    expect(detectIntent("welke risks heeft dit portfolio?").intent).toBe(
      "portfolio_risks",
    );
  });

  it("mapt concentratie-vragen naar fragile_concentration", () => {
    expect(
      detectIntent("Welke positie is te groot?").intent,
    ).toBe("fragile_concentration");
    expect(
      detectIntent("Is deze positie fragiel geconcentreerd?").intent,
    ).toBe("fragile_concentration");
  });

  it("mapt regime-vragen naar market_regime", () => {
    expect(detectIntent("Hoe defensief is de markt nu?").intent).toBe(
      "market_regime",
    );
    expect(detectIntent("Wat is het huidige regime?").intent).toBe(
      "market_regime",
    );
  });

  it("mapt score/quality-vragen naar holding_score", () => {
    expect(
      detectIntent("Wat is de quality score van ASML?").intent,
    ).toBe("holding_score");
    expect(detectIntent("Hoe factor-sterk is MSFT?").intent).toBe(
      "holding_score",
    );
  });

  it("extraheert ticker uit vrije tekst", () => {
    expect(detectIntent("Waarom is ASML zo groot?").ticker).toBe("ASML");
    expect(detectIntent("score van ASML.AS").ticker).toBe("ASML.AS");
  });

  it("valt terug bij out-of-scope vragen", () => {
    expect(detectIntent("Hoeveel belasting betaal ik?").intent).toBe(
      "fallback",
    );
    expect(detectIntent("Vertel me een grap").intent).toBe("fallback");
  });
});

describe("buildWelcomeMessage", () => {
  it("toont portfolio + regime + health + plan in bullets", () => {
    const message = buildWelcomeMessage(CTX);
    expect(message.role).toBe("assistant");
    expect(message.intent).toBe("welcome");
    expect(message.bullets).toBeDefined();
    expect(message.bullets!.some((b) => b.includes("8 posities"))).toBe(true);
    expect(message.bullets!.some((b) => b.includes("NEUTRAL"))).toBe(true);
    expect(message.bullets!.some((b) => b.includes("B"))).toBe(true);
  });

  it("meldt ontbrekend regime wanneer niet beschikbaar", () => {
    const ctxNoRegime: ChatContext = { ...CTX, regime: null };
    const message = buildWelcomeMessage(ctxNoRegime);
    expect(message.bullets!.some((b) => /geen recente/i.test(b))).toBe(true);
  });
});
