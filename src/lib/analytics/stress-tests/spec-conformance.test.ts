import { describe, expect, it } from "vitest";

import { STRESS_SCENARIO_CATALOG, getStressScenario } from "./catalog";
import { buildCustomScenario } from "./custom";
import {
  STRESS_DISCLAIMER,
  STRESS_SCENARIO_ORDER,
  type StressScenarioId,
} from "./types";

/**
 * Module 11 — Stress-tests & Scenario-analyse spec-conformance.
 *
 * Het Module 11-spec eist 10 scenarios + 4 transparantie-eisen:
 *  - Toon aannames
 *  - Toon onzekerheid (probability + severity)
 *  - Geen schijnexactheid
 *  - Duidelijk dat dit simulaties zijn (disclaimer)
 *
 * Deze tests bevriezen dat de engine die 10 scenarios kan produceren
 * + dat élke scenario assumptions[] + severity + probability bevat,
 * en dat een universele disclaimer aanwezig is.
 */

describe("Module 11 — alle 10 spec-scenarios aanwezig", () => {
  it("Catalog bevat de 9 vooraf-gedefinieerde Module 11-scenarios", () => {
    const SPEC_IDS: StressScenarioId[] = [
      "MARKET_CRASH_20", // 1. Marktcrash -20%
      "RATES_UP_SHARP", // 2. Rente stijgt sterk
      "RECESSION", // 3. Recessie
      "STAGFLATION", // 4. Inflatie blijft hoog
      "TECH_SELLOFF", // 5. Tech sell-off
      "ENERGY_CRISIS", // 6. Energiecrisis
      "USD_EUR_SHOCK", // 7. Dollar/euro-schok
      "SECTOR_ROTATION", // 8. Sectorrotatie
      "LIQUIDITY_CRISIS", // 9. Liquiditeitscrisis
    ];
    const catalogIds = new Set(STRESS_SCENARIO_CATALOG.map((s) => s.id));
    for (const id of SPEC_IDS) {
      expect(catalogIds.has(id)).toBe(true);
    }
  });

  it("CUSTOM is het 10e scenario (user-built via buildCustomScenario)", () => {
    const custom = buildCustomScenario({
      label: "Bear-case 2030",
      description: "Mijn eigen worst-case.",
      assumptions: ["Equities -30%", "Energy stijgt nog +20%"],
      defaultShock: -0.25,
      currencyShock: 0,
      bondShock: 0.05,
      cashShock: 0,
      severity: "severe",
    });
    expect(custom.id).toBe("CUSTOM");
    expect(custom.assumptions.length).toBeGreaterThan(0);
  });

  it("STRESS_SCENARIO_ORDER dekt alle 9 catalog-scenarios", () => {
    for (const id of STRESS_SCENARIO_ORDER) {
      expect(getStressScenario(id)).not.toBeNull();
    }
  });
});

describe("Module 11 — transparantie-eisen", () => {
  it("Elk scenario heeft een niet-lege assumptions[]-lijst (aannames-eis)", () => {
    for (const scenario of STRESS_SCENARIO_CATALOG) {
      expect(scenario.assumptions.length).toBeGreaterThan(0);
      for (const a of scenario.assumptions) {
        expect(a.length).toBeGreaterThan(10);
      }
    }
  });

  it("Elk scenario heeft severity + baselineProbability (onzekerheids-eis)", () => {
    const allowedSeverity = new Set(["moderate", "severe", "extreme"]);
    const allowedProb = new Set(["low", "medium", "high"]);
    for (const scenario of STRESS_SCENARIO_CATALOG) {
      expect(allowedSeverity.has(scenario.severity)).toBe(true);
      expect(allowedProb.has(scenario.baselineProbability)).toBe(true);
    }
  });

  it("STRESS_DISCLAIMER benoemt expliciet dat dit simulaties zijn (geen-schijnexactheid-eis)", () => {
    expect(STRESS_DISCLAIMER).toMatch(/indicatief|simulatie|niet als voorspelling/i);
    // Universele waarschuwing dat dit géén voorspelling is.
    expect(STRESS_DISCLAIMER.toLowerCase()).not.toMatch(
      /\bgegarandeerd\b|\bzeker\b/,
    );
  });

  it("Elk scenario heeft 1-zin NL-description (Lynch-laag)", () => {
    for (const scenario of STRESS_SCENARIO_CATALOG) {
      expect(scenario.description.length).toBeGreaterThan(20);
    }
  });
});

describe("Module 11 — Custom-scenario builder", () => {
  it("Builder accepteert eigen aannames en sector-overrides", () => {
    const custom = buildCustomScenario({
      label: "Mijn scenario",
      description: "Tech blijft koel, energy stijgt sterk.",
      assumptions: [
        "Tech-multiples krimpen met 25%",
        "Energie-prijzen +50% door beleidskeuze",
      ],
      sectorShocks: { tech: -0.25, energy: 0.30 },
      defaultShock: -0.05,
      currencyShock: 0,
      bondShock: -0.03,
      cashShock: 0,
      severity: "severe",
    });
    expect(custom.sectorShocks.tech).toBe(-0.25);
    expect(custom.sectorShocks.energy).toBe(0.30);
    // Niet-overgeschreven sectoren krijgen defaultShock.
    expect(custom.sectorShocks.healthcare).toBe(-0.05);
  });

  it("Builder propageert severity + assumptions", () => {
    const custom = buildCustomScenario({
      label: "Extreem",
      description: "Combined shock scenario.",
      assumptions: ["3 schokken tegelijk", "Liquiditeit valt deels weg"],
      defaultShock: -0.30,
      currencyShock: -0.10,
      bondShock: -0.05,
      cashShock: -0.02,
      severity: "extreme",
    });
    expect(custom.severity).toBe("extreme");
    expect(custom.assumptions).toHaveLength(2);
  });
});
