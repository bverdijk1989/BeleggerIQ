import { describe, expect, it } from "vitest";

import {
  DEFAULT_PREFERENCES,
  isCategoryAllowed,
  parsePreferences,
} from "./preferences";

describe("parsePreferences", () => {
  it("null → defaults (alles aan)", () => {
    expect(parsePreferences(null)).toEqual(DEFAULT_PREFERENCES);
  });

  it("partial object — ontbrekende velden krijgen defaults", () => {
    const r = parsePreferences({ weeklyDigest: false });
    expect(r.weeklyDigest).toBe(false);
    expect(r.instantCriticalAlerts).toBe(true);
    expect(r.watchlistAlerts).toBe(true);
  });

  it("non-boolean wordt genegeerd, default vult op", () => {
    const r = parsePreferences({ weeklyDigest: "yes" as unknown });
    expect(r.weeklyDigest).toBe(true);
  });

  it("rommel-input (string/number) crasht niet — alles default", () => {
    expect(parsePreferences("ja")).toEqual(DEFAULT_PREFERENCES);
    expect(parsePreferences(42)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe("isCategoryAllowed", () => {
  it("digest off → digest niet toegestaan", () => {
    expect(
      isCategoryAllowed(
        { ...DEFAULT_PREFERENCES, weeklyDigest: false },
        "digest",
      ),
    ).toBe(false);
  });

  it("instantCriticalAlerts off → critical-events ge-suppressed", () => {
    expect(
      isCategoryAllowed(
        { ...DEFAULT_PREFERENCES, instantCriticalAlerts: false },
        "critical",
      ),
    ).toBe(false);
  });

  it("watchlistAlerts off → watchlist niet doorlaten", () => {
    expect(
      isCategoryAllowed(
        { ...DEFAULT_PREFERENCES, watchlistAlerts: false },
        "watchlist",
      ),
    ).toBe(false);
  });

  it("alle aan → alles allowed", () => {
    expect(isCategoryAllowed(DEFAULT_PREFERENCES, "digest")).toBe(true);
    expect(isCategoryAllowed(DEFAULT_PREFERENCES, "critical")).toBe(true);
    expect(isCategoryAllowed(DEFAULT_PREFERENCES, "watchlist")).toBe(true);
  });
});
