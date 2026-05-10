/**
 * Custom-scenario builder.
 *
 * Vertaalt user-input naar een `StressScenarioDefinition` die de engine
 * kan draaien. Validatie + clamping zit hier zodat de engine
 * altijd-geldige input krijgt.
 */

import type { SectorBucket } from "../macro/regime";

import type {
  CustomStressScenarioInput,
  StressScenarioDefinition,
} from "./types";

const ALL_SECTORS: SectorBucket[] = [
  "tech",
  "growth",
  "consumer-discretionary",
  "consumer-staples",
  "financials",
  "energy",
  "materials",
  "industrials",
  "healthcare",
  "real-estate",
  "utilities",
  "communication",
  "unknown",
];

const SHOCK_MIN = -0.95;
const SHOCK_MAX = 1.0;

function clampShock(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < SHOCK_MIN) return SHOCK_MIN;
  if (v > SHOCK_MAX) return SHOCK_MAX;
  return v;
}

export function buildCustomScenario(
  input: CustomStressScenarioInput,
): StressScenarioDefinition {
  const defaultShock = clampShock(input.defaultShock);
  const sectorShocks: Record<SectorBucket, number> = {
    tech: defaultShock,
    growth: defaultShock,
    "consumer-discretionary": defaultShock,
    "consumer-staples": defaultShock,
    financials: defaultShock,
    energy: defaultShock,
    materials: defaultShock,
    industrials: defaultShock,
    healthcare: defaultShock,
    "real-estate": defaultShock,
    utilities: defaultShock,
    communication: defaultShock,
    unknown: defaultShock,
  };
  if (input.sectorShocks) {
    for (const sector of ALL_SECTORS) {
      const v = input.sectorShocks[sector];
      if (typeof v === "number" && Number.isFinite(v)) {
        sectorShocks[sector] = clampShock(v);
      }
    }
  }

  const label = input.label.trim().slice(0, 80) || "Eigen scenario";
  const description =
    input.description.trim().slice(0, 280) || "Door gebruiker gedefinieerd scenario.";
  const assumptions =
    input.assumptions.length > 0
      ? input.assumptions.map((a) => a.trim().slice(0, 200)).filter(Boolean)
      : ["Door gebruiker zelf gedefinieerd — controleer of de aannames realistisch zijn."];

  return {
    id: "CUSTOM",
    label,
    description,
    assumptions,
    baselineProbability: "low",
    severity: input.severity,
    sectorShocks,
    currencyShock: clampShock(input.currencyShock),
    bondShock: clampShock(input.bondShock),
    cashShock: clampShock(input.cashShock),
    typicalRegimes: [],
  };
}
