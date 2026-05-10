/**
 * Seed-provider — deterministische, plausibele macro-data zonder
 * externe bronnen. Wordt gebruikt in dev/CI én als fallback wanneer de
 * snapshot-provider geen data heeft.
 *
 * **Niet random**: dezelfde codebase produceert altijd dezelfde
 * default-snapshot. Voor productie hoort een echte provider gekoppeld
 * te worden (FRED, ECB SDW, Bloomberg).
 *
 * **Realistisch**: de waarden imiteren een "begin-2026"-achtige scenario
 * waar groei licht vertraagt en inflatie boven 2%-target ligt — een
 * stagflation-tinted neutral. Voldoende interessant om de UI te tonen.
 */

import type { ISODateString } from "@/types/common";

import type {
  MacroDataProvider,
  MacroDataSnapshot,
  RawMacroIndicator,
} from "./types";

const SEED_AS_OF: ISODateString = "2026-05-10";

const SEED_INDICATORS: RawMacroIndicator[] = [
  {
    key: "growth",
    value: 1.4, // GDP groei % YoY
    previousValue: 1.9,
    trend: "falling",
    asOf: SEED_AS_OF,
    source: "seed:plausible-2026",
    confidence: 0.7,
  },
  {
    key: "inflation",
    value: 3.1, // CPI % YoY
    previousValue: 2.8,
    trend: "rising",
    asOf: SEED_AS_OF,
    source: "seed:plausible-2026",
    confidence: 0.7,
  },
  {
    key: "rates",
    value: 4.2, // 10y staatsrente
    previousValue: 4.0,
    trend: "rising",
    asOf: SEED_AS_OF,
    source: "seed:plausible-2026",
    confidence: 0.85,
  },
  {
    key: "liquidity",
    // Liquiditeit als M2-groei % YoY; lage waarden = krappere liquiditeit.
    value: 1.8,
    previousValue: 2.4,
    trend: "falling",
    asOf: SEED_AS_OF,
    source: "seed:plausible-2026",
    confidence: 0.6,
  },
  {
    key: "recession_risk",
    // Composite probability uit yield-curve + leading-indicators, 0..100.
    value: 35,
    previousValue: 28,
    trend: "rising",
    asOf: SEED_AS_OF,
    source: "seed:plausible-2026",
    confidence: 0.6,
  },
  {
    key: "volatility",
    // VIX-equivalent.
    value: 22,
    previousValue: 17,
    trend: "rising",
    asOf: SEED_AS_OF,
    source: "seed:plausible-2026",
    confidence: 0.9,
  },
  {
    key: "sentiment",
    // Composite risk-on score 0..100 (hoger = risk-on).
    value: 42,
    previousValue: 55,
    trend: "falling",
    asOf: SEED_AS_OF,
    source: "seed:plausible-2026",
    confidence: 0.75,
  },
];

export class SeedMacroProvider implements MacroDataProvider {
  readonly id = "seed" as const;

  async fetch(): Promise<MacroDataSnapshot> {
    return {
      asOf: SEED_AS_OF,
      providerId: this.id,
      indicators: SEED_INDICATORS,
    };
  }
}
