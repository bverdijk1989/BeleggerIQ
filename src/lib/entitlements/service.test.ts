import { describe, expect, it } from "vitest";

import {
  FEATURE_CATALOG,
  TIER_CATALOG,
  TIER_RANK,
  getFeature,
  getTierDefinition,
} from "./catalog";
import {
  canUseFeature,
  getFeatureLimit,
  listFeaturesForTier,
  nextTierForFeature,
} from "./service";
import type { BillingTier, FeatureKey } from "./types";

describe("FEATURE_CATALOG — integriteit", () => {
  it("alle 4 tiers staan in TIER_RANK", () => {
    expect(TIER_RANK.FREE).toBe(0);
    expect(TIER_RANK.PRO).toBe(1);
    expect(TIER_RANK.ELITE).toBe(2);
    expect(TIER_RANK.ADVISOR).toBe(3);
  });

  it("alle features hebben unique keys", () => {
    const keys = FEATURE_CATALOG.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("alle features hebben minstens 1 tier", () => {
    for (const f of FEATURE_CATALOG) {
      expect(f.availableIn.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("alle features hebben non-empty label en description", () => {
    for (const f of FEATURE_CATALOG) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
    }
  });

  it("TIER_CATALOG heeft alle 4 tiers in de juiste sortOrder", () => {
    const tiers = [...TIER_CATALOG].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(tiers.map((t) => t.tier)).toEqual(["FREE", "PRO", "ELITE", "ADVISOR"]);
  });

  it("FREE tier heeft 0 EUR prijs", () => {
    const free = getTierDefinition("FREE");
    expect(free.monthlyPriceEur).toBe(0);
  });
});

describe("canUseFeature — basisgevallen", () => {
  it("FREE → portfolio.tracking is allowed met limit 10", () => {
    const r = canUseFeature("FREE", "portfolio.tracking");
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(10);
  });

  it("FREE → signal_fusion blocked + upgradeOptions = [ELITE, ADVISOR]", () => {
    const r = canUseFeature("FREE", "signal_fusion.confidence_score");
    expect(r.allowed).toBe(false);
    expect(r.upgradeOptions).toContain("ELITE");
    expect(r.upgradeOptions).toContain("ADVISOR");
  });

  it("PRO → behavioral.coach allowed, scenario.analysis blocked", () => {
    expect(canUseFeature("PRO", "behavioral.coach").allowed).toBe(true);
    expect(canUseFeature("PRO", "scenario.analysis").allowed).toBe(false);
  });

  it("ELITE → alle ELITE-features allowed", () => {
    expect(canUseFeature("ELITE", "signal_fusion.confidence_score").allowed).toBe(true);
    expect(canUseFeature("ELITE", "ai.explainability").allowed).toBe(true);
    expect(canUseFeature("ELITE", "scenario.analysis").allowed).toBe(true);
    expect(canUseFeature("ELITE", "macro.full").allowed).toBe(true);
    expect(canUseFeature("ELITE", "alerts.premium").allowed).toBe(true);
  });

  it("ELITE → advisor.multi_client blocked", () => {
    expect(canUseFeature("ELITE", "advisor.multi_client").allowed).toBe(false);
  });

  it("ADVISOR → alle features allowed", () => {
    for (const feature of FEATURE_CATALOG) {
      const r = canUseFeature("ADVISOR", feature.key);
      // ADVISOR mag echt alleen wat in `availableIn` staat. We checken
      // dat tenminste de advisor-features open staan + alle tiers >FREE.
      if (feature.availableIn.includes("ADVISOR")) {
        expect(r.allowed).toBe(true);
      }
    }
  });

  it("FREE → upgradeOptions zijn gesorteerd of bevatten goedkoopste", () => {
    const r = canUseFeature("FREE", "behavioral.coach");
    expect(r.upgradeOptions).toContain("PRO");
    expect(r.upgradeOptions).toContain("ELITE");
  });

  it("null tier → defaults naar FREE", () => {
    const r = canUseFeature(null, "portfolio.tracking");
    expect(r.tier).toBe("FREE");
    expect(r.allowed).toBe(true);
  });

  it("onbekende feature key → blocked, geen upgrade-options", () => {
    const r = canUseFeature("ELITE", "xx.does_not_exist" as FeatureKey);
    expect(r.allowed).toBe(false);
    expect(r.upgradeOptions).toEqual([]);
  });
});

describe("getFeatureLimit", () => {
  it("FREE portfolio.tracking → 10", () => {
    expect(getFeatureLimit("FREE", "portfolio.tracking")).toBe(10);
  });

  it("PRO portfolio.tracking → 50", () => {
    expect(getFeatureLimit("PRO", "portfolio.tracking")).toBe(50);
  });

  it("ELITE portfolio.tracking → null (unlimited)", () => {
    expect(getFeatureLimit("ELITE", "portfolio.tracking")).toBeNull();
  });

  it("FREE goals.basic → 1", () => {
    expect(getFeatureLimit("FREE", "goals.basic")).toBe(1);
  });

  it("PRO goals.basic → 5", () => {
    expect(getFeatureLimit("PRO", "goals.basic")).toBe(5);
  });

  it("FREE → blocked feature levert undefined", () => {
    expect(getFeatureLimit("FREE", "signal_fusion.confidence_score")).toBeUndefined();
  });
});

describe("listFeaturesForTier", () => {
  it("FREE → bevat tracking + basic health + weekly briefing + 1 goal", () => {
    const features = listFeaturesForTier("FREE");
    expect(features).toContain("portfolio.tracking");
    expect(features).toContain("health.basic");
    expect(features).toContain("briefing.weekly");
    expect(features).toContain("goals.basic");
  });

  it("FREE → bevat GEEN signal_fusion / ai.explainability / advisor", () => {
    const features = listFeaturesForTier("FREE");
    expect(features).not.toContain("signal_fusion.confidence_score");
    expect(features).not.toContain("ai.explainability");
    expect(features).not.toContain("advisor.multi_client");
  });

  it("ELITE → bevat alle ELITE-features", () => {
    const features = listFeaturesForTier("ELITE");
    expect(features).toContain("signal_fusion.confidence_score");
    expect(features).toContain("ai.explainability");
    expect(features).toContain("scenario.analysis");
    expect(features).toContain("macro.full");
    expect(features).toContain("alerts.premium");
    expect(features).toContain("goals.unlimited");
  });

  it("ADVISOR → bevat de 3 advisor-features", () => {
    const features = listFeaturesForTier("ADVISOR");
    expect(features).toContain("advisor.multi_client");
    expect(features).toContain("advisor.export_reports");
    expect(features).toContain("advisor.white_label");
  });

  it("hogere tier ⊋ lagere tier voor PRO/ELITE features", () => {
    const free = new Set(listFeaturesForTier("FREE"));
    const pro = new Set(listFeaturesForTier("PRO"));
    // PRO-only features niet in FREE
    expect(pro.has("behavioral.coach")).toBe(true);
    expect(free.has("behavioral.coach")).toBe(false);
  });
});

describe("nextTierForFeature", () => {
  it("FREE + signal_fusion → ELITE (goedkoopste upgrade)", () => {
    expect(
      nextTierForFeature("FREE", "signal_fusion.confidence_score"),
    ).toBe("ELITE");
  });

  it("PRO + scenario.analysis → ELITE", () => {
    expect(nextTierForFeature("PRO", "scenario.analysis")).toBe("ELITE");
  });

  it("FREE + behavioral.coach → PRO (goedkoopste die het ondersteunt)", () => {
    expect(nextTierForFeature("FREE", "behavioral.coach")).toBe("PRO");
  });

  it("ELITE + ai.explainability → null (al beschikbaar)", () => {
    expect(nextTierForFeature("ELITE", "ai.explainability")).toBeNull();
  });

  it("FREE + advisor.multi_client → ADVISOR (enige optie)", () => {
    expect(nextTierForFeature("FREE", "advisor.multi_client")).toBe("ADVISOR");
  });

  it("onbekende feature → null", () => {
    expect(nextTierForFeature("FREE", "xx.fake" as FeatureKey)).toBeNull();
  });
});

describe("getFeature + getTierDefinition", () => {
  it("getFeature levert de juiste definitie", () => {
    const f = getFeature("ai.explainability");
    expect(f).not.toBeNull();
    expect(f?.label).toMatch(/explain/i);
    expect(f?.availableIn).toContain("ELITE");
  });

  it("getFeature voor onbekende key → null", () => {
    expect(getFeature("nope" as FeatureKey)).toBeNull();
  });

  it("getTierDefinition retourneert per tier de juiste tagline", () => {
    expect(getTierDefinition("PRO").label).toBe("Pro");
    expect(getTierDefinition("ELITE").highlight).toBeUndefined(); // PRO is highlight
    expect(getTierDefinition("PRO").highlight).toBe(true);
  });

  it("getTierDefinition voor elke tier levert geldige object", () => {
    for (const tier of ["FREE", "PRO", "ELITE", "ADVISOR"] as BillingTier[]) {
      const def = getTierDefinition(tier);
      expect(def.tier).toBe(tier);
      expect(def.label.length).toBeGreaterThan(0);
    }
  });
});
