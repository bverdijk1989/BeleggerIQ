import { describe, expect, it } from "vitest";

import { getAssetMappingForRegime } from "./asset-mapping";
import type { AssetClassKey, MacroRegime } from "./types";

const ALL_ASSET_CLASSES: AssetClassKey[] = [
  "EQUITY_GROWTH",
  "EQUITY_VALUE",
  "EQUITY_DEFENSIVE",
  "EQUITY_CYCLICAL",
  "BOND_GOVERNMENT",
  "BOND_CORPORATE",
  "GOLD",
  "COMMODITIES",
  "CASH",
  "REAL_ESTATE",
];

describe("getAssetMappingForRegime — completeness", () => {
  const regimes: MacroRegime[] = [
    "GOLDILOCKS",
    "REFLATION",
    "STAGFLATION",
    "DEFLATION",
    "TRANSITIONAL",
  ];

  for (const regime of regimes) {
    it(`${regime} levert exact 10 asset-class impacts`, () => {
      const mapping = getAssetMappingForRegime(regime);
      expect(mapping.regime).toBe(regime);
      expect(mapping.impacts).toHaveLength(10);
      const keys = mapping.impacts.map((i) => i.assetClass);
      for (const key of ALL_ASSET_CLASSES) {
        expect(keys).toContain(key);
      }
    });
  }
});

describe("getAssetMappingForRegime — directie-checks", () => {
  it("GOLDILOCKS: groei-aandelen = tailwind", () => {
    const m = getAssetMappingForRegime("GOLDILOCKS");
    const growth = m.impacts.find((i) => i.assetClass === "EQUITY_GROWTH")!;
    expect(growth.direction).toBe("tailwind");
    expect(growth.magnitude).toBeGreaterThan(0.5);
  });

  it("STAGFLATION: goud = tailwind, growth = headwind", () => {
    const m = getAssetMappingForRegime("STAGFLATION");
    expect(
      m.impacts.find((i) => i.assetClass === "GOLD")!.direction,
    ).toBe("tailwind");
    expect(
      m.impacts.find((i) => i.assetClass === "EQUITY_GROWTH")!.direction,
    ).toBe("headwind");
  });

  it("DEFLATION: government bonds = tailwind, cyclicals = headwind", () => {
    const m = getAssetMappingForRegime("DEFLATION");
    expect(
      m.impacts.find((i) => i.assetClass === "BOND_GOVERNMENT")!.direction,
    ).toBe("tailwind");
    expect(
      m.impacts.find((i) => i.assetClass === "EQUITY_CYCLICAL")!.direction,
    ).toBe("headwind");
  });

  it("REFLATION: commodities = tailwind, government bonds = headwind", () => {
    const m = getAssetMappingForRegime("REFLATION");
    expect(
      m.impacts.find((i) => i.assetClass === "COMMODITIES")!.direction,
    ).toBe("tailwind");
    expect(
      m.impacts.find((i) => i.assetClass === "BOND_GOVERNMENT")!.direction,
    ).toBe("headwind");
  });

  it("TRANSITIONAL: alle directies neutraal", () => {
    const m = getAssetMappingForRegime("TRANSITIONAL");
    for (const i of m.impacts) {
      expect(i.direction).toBe("neutral");
    }
  });
});
