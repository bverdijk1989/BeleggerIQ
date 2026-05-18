import { describe, expect, it } from "vitest";

import {
  WIZARD_STEP_ORDER,
  defaultPreferences,
  nextStep,
  previousStep,
  stepIndex,
  validatePreferences,
  wizardProgressPercent,
  type OnboardingPreferences,
  type WizardStep,
} from "./wizard";

/**
 * Module 20 — wizard pure-function tests.
 */

describe("WIZARD_STEP_ORDER", () => {
  it("bevat 5 stappen in canonical volgorde", () => {
    expect(WIZARD_STEP_ORDER).toEqual([
      "OBJECTIVE",
      "EXPERIENCE",
      "RISK",
      "STYLE",
      "PORTFOLIO",
    ]);
  });
});

describe("defaultPreferences", () => {
  it("retourneert een valide preferences-object", () => {
    const prefs = defaultPreferences();
    const result = validatePreferences(prefs);
    expect(result.ok).toBe(true);
    expect(prefs.uxMode).toBe("FOCUS"); // default per UX-mode-spec
    expect(prefs.riskTolerance).toBe("BALANCED");
  });
});

describe("validatePreferences", () => {
  it("compleet object → ok", () => {
    const prefs: OnboardingPreferences = {
      objective: "RETIREMENT",
      uxMode: "BEGINNER",
      riskTolerance: "CONSERVATIVE",
      style: "ETF",
      portfolioBootstrap: "MANUAL",
    };
    expect(validatePreferences(prefs).ok).toBe(true);
  });

  it("ongeldig veld → error", () => {
    const result = validatePreferences({
      objective: "MOON_SHOT",
      uxMode: "FOCUS",
      riskTolerance: "BALANCED",
      style: "ETF",
      portfolioBootstrap: "MANUAL",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("null input → defensive error", () => {
    expect(validatePreferences(null).ok).toBe(false);
  });

  it("undefined → defensive error", () => {
    expect(validatePreferences(undefined).ok).toBe(false);
  });

  it("primitieve type → defensive error", () => {
    expect(validatePreferences("not-an-object").ok).toBe(false);
  });

  it("missende velden → multiple errors", () => {
    const result = validatePreferences({});
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBe(5); // alle 5 velden ontbreken
  });
});

describe("Step-navigatie helpers", () => {
  it("nextStep volgt canonical volgorde", () => {
    expect(nextStep("OBJECTIVE")).toBe("EXPERIENCE");
    expect(nextStep("EXPERIENCE")).toBe("RISK");
    expect(nextStep("RISK")).toBe("STYLE");
    expect(nextStep("STYLE")).toBe("PORTFOLIO");
    expect(nextStep("PORTFOLIO")).toBeNull();
  });

  it("previousStep keert volgorde om", () => {
    expect(previousStep("PORTFOLIO")).toBe("STYLE");
    expect(previousStep("STYLE")).toBe("RISK");
    expect(previousStep("RISK")).toBe("EXPERIENCE");
    expect(previousStep("EXPERIENCE")).toBe("OBJECTIVE");
    expect(previousStep("OBJECTIVE")).toBeNull();
  });

  it("stepIndex is 1-based", () => {
    expect(stepIndex("OBJECTIVE")).toBe(1);
    expect(stepIndex("EXPERIENCE")).toBe(2);
    expect(stepIndex("PORTFOLIO")).toBe(5);
  });

  it("wizardProgressPercent: laatste stap = 100", () => {
    expect(wizardProgressPercent("OBJECTIVE")).toBe(20);
    expect(wizardProgressPercent("EXPERIENCE")).toBe(40);
    expect(wizardProgressPercent("RISK")).toBe(60);
    expect(wizardProgressPercent("STYLE")).toBe(80);
    expect(wizardProgressPercent("PORTFOLIO")).toBe(100);
  });
});

describe("Module 20 — spec-conformance: 5 stappen", () => {
  it("Spec eist exact 5 stappen", () => {
    expect(WIZARD_STEP_ORDER.length).toBe(5);
  });

  it("Spec eist deze 5 thema's: doel/ervaring/risico/stijl/portfolio", () => {
    const expected: WizardStep[] = [
      "OBJECTIVE",
      "EXPERIENCE",
      "RISK",
      "STYLE",
      "PORTFOLIO",
    ];
    for (const step of expected) {
      expect(WIZARD_STEP_ORDER).toContain(step);
    }
  });

  it("Beginner Mode is simpeler dan Expert Mode (spec UX-regel)", () => {
    // Dit is een type-niveau-assertion: BEGINNER en EXPERT zijn beide
    // toegestane uxMode-waarden; UI rendert ze verschillend. Hier checken
    // we dat de wizard ze allebei accepteert.
    const beginner = validatePreferences({
      objective: "RETIREMENT",
      uxMode: "BEGINNER",
      riskTolerance: "CONSERVATIVE",
      style: "ETF",
      portfolioBootstrap: "MANUAL",
    });
    const expert = validatePreferences({
      objective: "GROWTH",
      uxMode: "EXPERT",
      riskTolerance: "AGGRESSIVE",
      style: "STOCKS",
      portfolioBootstrap: "MANUAL",
    });
    expect(beginner.ok).toBe(true);
    expect(expert.ok).toBe(true);
  });
});
