import { describe, expect, it } from "vitest";

import { FEATURE_CATALOG, TIER_CATALOG } from "./catalog";
import { canUseFeature, listFeaturesForTier } from "./service";
import type { BillingTier, FeatureKey } from "./types";

/**
 * Module 13 — Premium paywall & feature-entitlements spec-conformance.
 *
 * Het Module 13-spec definieert expliciet WELKE features in WELKE tier
 * zitten. Deze tests bevriezen die tier-matrix zodat een toekomstige
 * refactor de pricing-belofte niet stilletjes kan breken.
 *
 * Plus: tests tegen feature-bypass (Module 13 eis "tests tegen feature
 * bypass") — een lagere tier mag GEEN toegang krijgen tot een hogere-
 * tier feature, ongeacht hoe de check wordt aangeroepen.
 */

const EXPECTED_FREE_FEATURES: FeatureKey[] = [
  "portfolio.tracking",
  "health.basic",
  "briefing.weekly",
  "goals.basic",
];

// Pro krijgt alles van Module 13-spec voor PRO:
//   volledige health + daily briefing + behavioral coach +
//   watchlist intelligence + basis scenario's + alerts
const EXPECTED_PRO_NEW_FEATURES: FeatureKey[] = [
  "health.full",
  "briefing.daily",
  "behavioral.coach",
  "watchlist.intelligence",
  "scenario.basic",
  "alerts.basic",
  "macro.basic",
  "portfolio.multi_portfolio",
];

// Elite krijgt extra:
//   signal fusion + geavanceerde macro + volledige stresstests +
//   crypto lab + AI explainability + premium alerts
const EXPECTED_ELITE_NEW_FEATURES: FeatureKey[] = [
  "signal_fusion.confidence_score",
  "macro.full",
  "scenario.analysis",
  "crypto.lab",
  "ai.explainability",
  "alerts.premium",
  "portfolio.unlimited_holdings",
  "goals.unlimited",
];

const EXPECTED_ADVISOR_ONLY_FEATURES: FeatureKey[] = [
  "advisor.multi_client",
  "advisor.export_reports",
  "advisor.white_label",
  "advisor.team_roles",
];

describe("Module 13 — tier-matrix matches spec", () => {
  it("FREE-tier geeft access tot de FREE-set", () => {
    for (const key of EXPECTED_FREE_FEATURES) {
      expect(canUseFeature("FREE", key).allowed).toBe(true);
    }
  });

  it("PRO-tier geeft access tot alle Module 13 Pro-features", () => {
    for (const key of EXPECTED_PRO_NEW_FEATURES) {
      expect(canUseFeature("PRO", key).allowed).toBe(true);
    }
  });

  it("ELITE-tier geeft access tot alle Module 13 Elite-features", () => {
    for (const key of EXPECTED_ELITE_NEW_FEATURES) {
      expect(canUseFeature("ELITE", key).allowed).toBe(true);
    }
  });

  it("ADVISOR-tier geeft access tot advisor-only features", () => {
    for (const key of EXPECTED_ADVISOR_ONLY_FEATURES) {
      expect(canUseFeature("ADVISOR", key).allowed).toBe(true);
    }
  });
});

describe("Module 13 — feature-bypass tests (geen impliciete tier-stacking)", () => {
  it("FREE krijgt GEEN toegang tot PRO-only features", () => {
    for (const key of EXPECTED_PRO_NEW_FEATURES) {
      expect(canUseFeature("FREE", key).allowed).toBe(false);
    }
  });

  it("FREE krijgt GEEN toegang tot ELITE-only features", () => {
    for (const key of EXPECTED_ELITE_NEW_FEATURES) {
      expect(canUseFeature("FREE", key).allowed).toBe(false);
    }
  });

  it("PRO krijgt GEEN toegang tot ELITE-only features", () => {
    for (const key of EXPECTED_ELITE_NEW_FEATURES) {
      expect(canUseFeature("PRO", key).allowed).toBe(false);
    }
  });

  it("ELITE krijgt GEEN toegang tot ADVISOR-only features", () => {
    for (const key of EXPECTED_ADVISOR_ONLY_FEATURES) {
      expect(canUseFeature("ELITE", key).allowed).toBe(false);
    }
  });

  it("null/undefined tier valt terug op FREE (defensive)", () => {
    expect(canUseFeature(null, "briefing.daily").allowed).toBe(false);
    expect(canUseFeature(undefined, "crypto.lab").allowed).toBe(false);
    expect(canUseFeature(null, "health.basic").allowed).toBe(true);
  });

  it("Onbekende feature-key → geblokkeerd (defensive)", () => {
    const result = canUseFeature("ELITE", "bogus.feature" as FeatureKey);
    expect(result.allowed).toBe(false);
  });
});

describe("Module 13 — Free moet nuttig zijn (UX-eis)", () => {
  it("FREE heeft minimaal 4 features beschikbaar", () => {
    const features = listFeaturesForTier("FREE");
    expect(features.length).toBeGreaterThanOrEqual(4);
  });

  it("FREE heeft tracking + health + briefing + goal — kern-functionaliteit", () => {
    const features = new Set(listFeaturesForTier("FREE"));
    expect(features.has("portfolio.tracking")).toBe(true);
    expect(features.has("health.basic")).toBe(true);
    expect(features.has("briefing.weekly")).toBe(true);
    expect(features.has("goals.basic")).toBe(true);
  });
});

describe("Module 13 — pricing-page contract", () => {
  it("Alle 4 tiers staan in TIER_CATALOG", () => {
    const tiers = new Set(TIER_CATALOG.map((t) => t.tier));
    for (const t of ["FREE", "PRO", "ELITE", "ADVISOR"] as BillingTier[]) {
      expect(tiers.has(t)).toBe(true);
    }
  });

  it("FREE-tier prijs is €0", () => {
    const free = TIER_CATALOG.find((t) => t.tier === "FREE")!;
    expect(free.monthlyPriceEur).toBe(0);
  });

  it("ADVISOR prijs is 'op aanvraag' (null)", () => {
    const adv = TIER_CATALOG.find((t) => t.tier === "ADVISOR")!;
    expect(adv.monthlyPriceEur).toBeNull();
  });

  it("Elke tier heeft een ctaLabel + tagline (geen agressieve dark patterns)", () => {
    for (const t of TIER_CATALOG) {
      expect(t.ctaLabel.length).toBeGreaterThan(0);
      expect(t.tagline.length).toBeGreaterThan(0);
      // Geen "Koop nu!" of "Mis dit niet!"-taal die als dark pattern voelt.
      const aggressivePatterns = /\bmis dit niet\b|\bkoop nu\b|\bnu of nooit\b/i;
      expect(t.ctaLabel).not.toMatch(aggressivePatterns);
      expect(t.tagline).not.toMatch(aggressivePatterns);
    }
  });
});

describe("Module 13 — limits zijn tier-specifiek", () => {
  it("portfolio.tracking limit groeit met tier", () => {
    const free = canUseFeature("FREE", "portfolio.tracking");
    const pro = canUseFeature("PRO", "portfolio.tracking");
    const elite = canUseFeature("ELITE", "portfolio.tracking");
    expect(free.limit).toBe(10);
    expect(pro.limit).toBe(50);
    expect(elite.limit).toBeNull(); // unlimited
  });

  it("goals.basic limit groeit met tier", () => {
    expect(canUseFeature("FREE", "goals.basic").limit).toBe(1);
    expect(canUseFeature("PRO", "goals.basic").limit).toBe(5);
    expect(canUseFeature("ELITE", "goals.basic").limit).toBeNull();
  });
});

describe("Module 13 — catalog-integriteit", () => {
  it("Geen dubbele feature-keys", () => {
    const keys = FEATURE_CATALOG.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Elke feature heeft minstens 1 tier waar 'em beschikbaar is", () => {
    for (const f of FEATURE_CATALOG) {
      expect(f.availableIn.length).toBeGreaterThan(0);
    }
  });

  it("Elke feature heeft label + description (transparantie-eis)", () => {
    for (const f of FEATURE_CATALOG) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(20);
    }
  });
});
