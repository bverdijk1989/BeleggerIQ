import { describe, expect, it } from "vitest";

import { deriveHoldingAction } from "./holding-action";

describe("deriveHoldingAction", () => {
  it("WATCH bij ontbrekende composite", () => {
    expect(deriveHoldingAction({}).action).toBe("WATCH");
  });

  it("WATCH bij lage confidence", () => {
    const result = deriveHoldingAction({ composite: 80, confidence: 0.2 });
    expect(result.action).toBe("WATCH");
    expect(result.rationale).toMatch(/coverage/i);
  });

  it("BUY_CANDIDATE bij sterke score en voldoende coverage", () => {
    expect(
      deriveHoldingAction({ composite: 82, confidence: 0.7 }).action,
    ).toBe("BUY_CANDIDATE");
  });

  it("AVOID bij zeer lage score", () => {
    expect(
      deriveHoldingAction({ composite: 25, confidence: 0.7 }).action,
    ).toBe("AVOID");
  });

  it("TRIM bij matige score én overweight t.o.v. target", () => {
    expect(
      deriveHoldingAction({
        composite: 42,
        confidence: 0.7,
        currentWeight: 0.2,
        targetWeight: 0.1,
      }).action,
    ).toBe("TRIM");
  });

  it("HOLD bij matige score zonder overweight", () => {
    expect(
      deriveHoldingAction({
        composite: 42,
        confidence: 0.7,
        currentWeight: 0.1,
        targetWeight: 0.1,
      }).action,
    ).toBe("HOLD");
  });

  it("HOLD bij bovengemiddelde maar niet top-score", () => {
    expect(
      deriveHoldingAction({ composite: 65, confidence: 0.7 }).action,
    ).toBe("HOLD");
  });

  it("negeert targetWeight wanneer onbekend voor TRIM", () => {
    expect(
      deriveHoldingAction({ composite: 42, confidence: 0.7 }).action,
    ).toBe("HOLD");
  });
});
