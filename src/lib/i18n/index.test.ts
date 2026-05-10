import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, normalizeLocale, t } from ".";

describe("t — translation lookup", () => {
  it("retourneert NL-string voor bekende key, NL-locale", () => {
    expect(t("nav.dashboard", "nl")).toBe("Dashboard");
  });

  it("retourneert EN-string voor bekende key, EN-locale", () => {
    expect(t("nav.maandbeslissing", "en")).toBe("Monthly decision");
  });

  it("default locale = NL wanneer geen locale meegegeven", () => {
    expect(t("nav.belasting")).toBe("Belasting");
  });

  it("compliance.title bevat in NL 'belastingadvies' (legal-precision)", () => {
    expect(t("compliance.title", "nl")).toMatch(/belastingadvies/i);
  });

  it("compliance.title bevat in EN 'investment or tax advice'", () => {
    expect(t("compliance.title", "en")).toMatch(/investment or tax advice/i);
  });

  it("alle nav-keys zijn vertaald in beide locales (geen ontbrekende strings)", () => {
    const navKeys = [
      "nav.dashboard",
      "nav.portfolio",
      "nav.risico",
      "nav.maandbeslissing",
      "nav.kansen",
      "nav.screener",
      "nav.strategy_lab",
      "nav.backtest",
      "nav.transacties",
      "nav.belasting",
      "nav.watchlist",
      "nav.chat",
      "nav.profiel",
      "nav.methodologie",
    ] as const;
    for (const key of navKeys) {
      expect(t(key, "nl")).not.toBe(key);
      expect(t(key, "en")).not.toBe(key);
      expect(t(key, "nl")).not.toBe("");
      expect(t(key, "en")).not.toBe("");
    }
  });
});

describe("normalizeLocale", () => {
  it("'en' → 'en'", () => {
    expect(normalizeLocale("en")).toBe("en");
  });

  it("'nl' → 'nl'", () => {
    expect(normalizeLocale("nl")).toBe("nl");
  });

  it("'en-US' → 'en' (locale-region prefix wordt gestript)", () => {
    expect(normalizeLocale("en-US")).toBe("en");
  });

  it("'nl-NL' → 'nl'", () => {
    expect(normalizeLocale("nl-NL")).toBe("nl");
  });

  it("hoofdletters → lowercase", () => {
    expect(normalizeLocale("EN")).toBe("en");
  });

  it("onbekend → DEFAULT_LOCALE (nl)", () => {
    expect(normalizeLocale("zh")).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale("xyz")).toBe(DEFAULT_LOCALE);
  });

  it("non-string input → DEFAULT_LOCALE", () => {
    expect(normalizeLocale(null)).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(42)).toBe(DEFAULT_LOCALE);
  });
});
