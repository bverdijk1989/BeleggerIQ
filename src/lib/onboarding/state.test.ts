import { describe, expect, it } from "vitest";

import {
  computeProgressPercent,
  deriveOnboardingState,
  type OnboardingContext,
} from "./state";

const FRESH: OnboardingContext = {
  hasProfile: false,
  hasPortfolio: false,
  hasSnapshot: false,
  onboardedAt: null,
};

describe("deriveOnboardingState — happy path progression", () => {
  it("verse user → PROFILE step", () => {
    const s = deriveOnboardingState(FRESH);
    expect(s.nextStep).toBe("PROFILE");
    expect(s.completedSteps).toBe(0);
    expect(s.isComplete).toBe(false);
  });

  it("profile gemaakt → PORTFOLIO step", () => {
    const s = deriveOnboardingState({ ...FRESH, hasProfile: true });
    expect(s.nextStep).toBe("PORTFOLIO");
    expect(s.completedSteps).toBe(1);
  });

  it("profile + portfolio → SNAPSHOT step", () => {
    const s = deriveOnboardingState({
      ...FRESH,
      hasProfile: true,
      hasPortfolio: true,
    });
    expect(s.nextStep).toBe("SNAPSHOT");
    expect(s.completedSteps).toBe(2);
  });

  it("alle drie → COMPLETE step (klaar-knop nog niet gedrukt)", () => {
    const s = deriveOnboardingState({
      ...FRESH,
      hasProfile: true,
      hasPortfolio: true,
      hasSnapshot: true,
    });
    expect(s.nextStep).toBe("COMPLETE");
    expect(s.completedSteps).toBe(3);
    expect(s.isComplete).toBe(false);
  });

  it("onboardedAt gezet → isComplete=true ongeacht andere flags", () => {
    const s = deriveOnboardingState({
      ...FRESH,
      onboardedAt: new Date(),
    });
    expect(s.nextStep).toBe("COMPLETE");
    expect(s.isComplete).toBe(true);
    expect(s.completedSteps).toBe(3);
  });

  it("portfolio zonder profile (data-anomalie) → terug naar PROFILE", () => {
    const s = deriveOnboardingState({
      ...FRESH,
      hasPortfolio: true,
      hasSnapshot: true,
    });
    expect(s.nextStep).toBe("PROFILE");
  });
});

describe("computeProgressPercent", () => {
  it("0/3 → 0%", () => {
    expect(computeProgressPercent(deriveOnboardingState(FRESH))).toBe(0);
  });

  it("1/3 → 33%", () => {
    expect(
      computeProgressPercent(
        deriveOnboardingState({ ...FRESH, hasProfile: true }),
      ),
    ).toBe(33);
  });

  it("3/3 → 100%", () => {
    expect(
      computeProgressPercent(
        deriveOnboardingState({
          ...FRESH,
          hasProfile: true,
          hasPortfolio: true,
          hasSnapshot: true,
        }),
      ),
    ).toBe(100);
  });
});
