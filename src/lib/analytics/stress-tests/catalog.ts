/**
 * Stress-scenario catalog — 9 vooraf-gedefinieerde scenarios.
 * (Het 10e is CUSTOM, gebouwd door de gebruiker via `custom.ts`.)
 *
 * **Aannames** (Simons-laag): elke scenario heeft een expliciete assumptions-
 * lijst zodat de gebruiker ziet WAT we modelleren. UI toont deze in een
 * uncertainty-paneel onder de impact-grafiek.
 *
 * **Drempels**: shock-waarden zijn historisch geijkt — bv. tech-sell-off
 * gebruikt -32% omdat dat ongeveer Nasdaq-2000-2001-correctie is. Geen
 * voorspelling; een referentie-bewerking.
 */

import type { SectorBucket } from "../macro/regime";

import type { StressScenarioDefinition } from "./types";

const ZERO_SECTOR_MAP: Record<SectorBucket, number> = {
  tech: 0,
  growth: 0,
  "consumer-discretionary": 0,
  "consumer-staples": 0,
  financials: 0,
  energy: 0,
  materials: 0,
  industrials: 0,
  healthcare: 0,
  "real-estate": 0,
  utilities: 0,
  communication: 0,
  unknown: 0,
};

function sectorMap(
  overrides: Partial<Record<SectorBucket, number>>,
  defaultShock: number,
): Record<SectorBucket, number> {
  const out = { ...ZERO_SECTOR_MAP };
  // Eerst default invullen
  for (const k of Object.keys(out) as SectorBucket[]) out[k] = defaultShock;
  // Dan specifieke overrides
  for (const [k, v] of Object.entries(overrides) as Array<[SectorBucket, number]>) {
    out[k] = v;
  }
  return out;
}

// ============================================================
//  9 vooraf-gedefinieerde scenarios
// ============================================================

const RATES_UP_SHARP: StressScenarioDefinition = {
  id: "RATES_UP_SHARP",
  label: "Rente stijgt sterk",
  description: "10y-rente +200bp in 6 maanden — duration-pijn op groei + REITs.",
  assumptions: [
    "Lange-termijn-rente stijgt met +2 procentpunt; korte rente volgt deels.",
    "Multiples van groei-aandelen krimpen ~15% door discount-rate-effect.",
    "REITs en utilities gevoelig voor herfinancierings-cost.",
    "Financials profiteren marginaal van bredere net-interest-margin.",
    "Geen recessie — alleen rente-druk op waarderingen.",
  ],
  baselineProbability: "medium",
  severity: "severe",
  sectorShocks: sectorMap(
    {
      tech: -0.18,
      growth: -0.22,
      "consumer-discretionary": -0.10,
      "consumer-staples": -0.04,
      financials: 0.03,
      energy: -0.02,
      materials: -0.06,
      industrials: -0.07,
      healthcare: -0.05,
      "real-estate": -0.20,
      utilities: -0.12,
      communication: -0.08,
    },
    -0.08,
  ),
  currencyShock: 0,
  bondShock: -0.10,
  cashShock: 0,
  typicalRegimes: ["REFLATION", "STAGFLATION"],
};

const RECESSION: StressScenarioDefinition = {
  id: "RECESSION",
  label: "Recessie",
  description: "Wereldwijde recessie met -25% equities en stijgende werkloosheid.",
  assumptions: [
    "BBP daalt 2% wereldwijd; werkloosheid +2pp.",
    "Cyclische sectoren (consumer-disc, industrials, materials) krijgen 25-30% klap.",
    "Defensieve sectoren (staples, healthcare, utilities) houden veel beter stand.",
    "Centrale banken verlagen rentes — bonds krijgen rugwind.",
    "Cash blijft stabiel in nominale waarde.",
  ],
  baselineProbability: "medium",
  severity: "severe",
  sectorShocks: sectorMap(
    {
      tech: -0.18,
      growth: -0.22,
      "consumer-discretionary": -0.30,
      "consumer-staples": -0.06,
      financials: -0.22,
      energy: -0.20,
      materials: -0.28,
      industrials: -0.28,
      healthcare: -0.08,
      "real-estate": -0.18,
      utilities: -0.05,
      communication: -0.15,
    },
    -0.18,
  ),
  currencyShock: 0,
  bondShock: 0.08,
  cashShock: 0,
  typicalRegimes: ["DEFLATION", "STAGFLATION"],
};

const STAGFLATION: StressScenarioDefinition = {
  id: "STAGFLATION",
  label: "Inflatie blijft hoog",
  description: "CPI > 4%, groei stagneert; reële rendementen onder druk.",
  assumptions: [
    "Inflatie blijft 12+ maanden boven 4%.",
    "BBP-groei stagneert (0-1%).",
    "Goud + grondstoffen + energie krijgen rugwind.",
    "Lange-duration assets (tech, REITs) zwaar onder druk.",
    "Reële cash-rendement is negatief.",
  ],
  baselineProbability: "medium",
  severity: "severe",
  sectorShocks: sectorMap(
    {
      tech: -0.20,
      growth: -0.25,
      "consumer-discretionary": -0.18,
      "consumer-staples": -0.05,
      financials: -0.10,
      energy: 0.10,
      materials: 0.05,
      industrials: -0.10,
      healthcare: -0.05,
      "real-estate": -0.15,
      utilities: -0.08,
      communication: -0.12,
    },
    -0.10,
  ),
  currencyShock: 0,
  bondShock: -0.12,
  cashShock: -0.04,
  typicalRegimes: ["STAGFLATION"],
};

const TECH_SELLOFF: StressScenarioDefinition = {
  id: "TECH_SELLOFF",
  label: "Tech sell-off",
  description: "Nasdaq -35% door rente + growth-multiple-compressie.",
  assumptions: [
    "Tech-multiples krimpen fors (P/S vanaf 8 → 4).",
    "Growth-aandelen geraakt door rente + dalende winstgroei-verwachting.",
    "Andere sectoren houden relatief stand (markt-geleide rotatie).",
    "Geen recessie — sector-specifieke schok.",
  ],
  baselineProbability: "medium",
  severity: "severe",
  sectorShocks: sectorMap(
    {
      tech: -0.35,
      growth: -0.38,
      "consumer-discretionary": -0.12,
      "consumer-staples": -0.02,
      financials: -0.05,
      energy: 0.02,
      materials: -0.04,
      industrials: -0.06,
      healthcare: -0.04,
      "real-estate": -0.08,
      utilities: 0.01,
      communication: -0.20,
    },
    -0.05,
  ),
  currencyShock: 0,
  bondShock: 0.02,
  cashShock: 0,
  typicalRegimes: ["REFLATION", "STAGFLATION"],
};

const ENERGY_CRISIS: StressScenarioDefinition = {
  id: "ENERGY_CRISIS",
  label: "Energiecrisis",
  description: "Olie + gasprijzen +50% door geopolitiek; CPI-spike.",
  assumptions: [
    "Brent +50%, gas-prijzen +75%.",
    "Industrials + materials + chemie geraakt door input-cost.",
    "Energie-aandelen profiteren fors (cyclisch).",
    "Inflatie spikes; rente stijgt mee.",
    "Consumer-disc onder druk door koopkracht-verlies.",
  ],
  baselineProbability: "low",
  severity: "severe",
  sectorShocks: sectorMap(
    {
      tech: -0.10,
      growth: -0.12,
      "consumer-discretionary": -0.20,
      "consumer-staples": -0.04,
      financials: -0.05,
      energy: 0.30,
      materials: -0.08,
      industrials: -0.15,
      healthcare: -0.03,
      "real-estate": -0.10,
      utilities: -0.05,
      communication: -0.07,
    },
    -0.06,
  ),
  currencyShock: 0,
  bondShock: -0.07,
  cashShock: -0.03,
  typicalRegimes: ["STAGFLATION", "REFLATION"],
};

const USD_EUR_SHOCK: StressScenarioDefinition = {
  id: "USD_EUR_SHOCK",
  label: "Dollar/Euro-schok",
  description: "USD/EUR ±10% beweging in 1 maand — FX-translation impact.",
  assumptions: [
    "EUR-versterking met 10% verlaagt EUR-waarde van USD-noteringen.",
    "USD-bedrijven met EU-export krijgen marginale operating-pain.",
    "Hedged ETFs ontwijken het effect; ongedekte posities krijgen vol.",
    "Geen onderliggend equity-shock — puur valuta.",
  ],
  baselineProbability: "medium",
  severity: "moderate",
  sectorShocks: sectorMap(
    {
      tech: 0,
      growth: 0,
      "consumer-discretionary": -0.02,
      "consumer-staples": -0.01,
      financials: 0,
      energy: 0,
      materials: 0,
      industrials: -0.02,
      healthcare: 0,
      "real-estate": 0,
      utilities: 0,
      communication: 0,
    },
    0,
  ),
  // De hoofdklap zit in currency-shock voor niet-base posities:
  currencyShock: -0.10,
  bondShock: 0,
  cashShock: 0,
  typicalRegimes: ["GOLDILOCKS", "REFLATION", "TRANSITIONAL"],
};

const MARKET_CRASH_20: StressScenarioDefinition = {
  id: "MARKET_CRASH_20",
  label: "Marktcrash -20%",
  description: "Brede aandelenmarkt -20% in 3 maanden; defensieve sectors zachter.",
  assumptions: [
    "S&P 500 / Stoxx 600 dalen ~20% in 3 maanden.",
    "Bèta-shock: hoog-beta posities getroffen extra zwaar (1.3×).",
    "Defensieve sectoren beperkt geraakt (-8 tot -12%).",
    "Bonds krijgen vlucht-vraag (rugwind).",
    "Geen specifieke trigger benoemd — generieke risk-off.",
  ],
  baselineProbability: "medium",
  severity: "severe",
  sectorShocks: sectorMap(
    {
      tech: -0.28,
      growth: -0.32,
      "consumer-discretionary": -0.25,
      "consumer-staples": -0.10,
      financials: -0.22,
      energy: -0.20,
      materials: -0.22,
      industrials: -0.24,
      healthcare: -0.12,
      "real-estate": -0.22,
      utilities: -0.08,
      communication: -0.18,
    },
    -0.20,
  ),
  currencyShock: 0,
  bondShock: 0.05,
  cashShock: 0,
  typicalRegimes: ["DEFLATION", "STAGFLATION"],
};

const SECTOR_ROTATION: StressScenarioDefinition = {
  id: "SECTOR_ROTATION",
  label: "Sectorrotatie",
  description: "Geld stroomt van groei naar value/cyclical — geen totale crash.",
  assumptions: [
    "Tech + growth verliezen 12-18% door multiple-compressie.",
    "Value, financials, energy, materials krijgen rugwind.",
    "Defensieve sectoren neutraal — geen vlucht-trade nodig.",
    "Bonds licht geraakt door rente-stijging.",
    "Wereld-BBP onveranderd.",
  ],
  baselineProbability: "high",
  severity: "moderate",
  sectorShocks: sectorMap(
    {
      tech: -0.16,
      growth: -0.18,
      "consumer-discretionary": -0.05,
      "consumer-staples": 0.02,
      financials: 0.10,
      energy: 0.12,
      materials: 0.08,
      industrials: 0.05,
      healthcare: 0,
      "real-estate": -0.05,
      utilities: 0.02,
      communication: -0.08,
    },
    -0.02,
  ),
  currencyShock: 0,
  bondShock: -0.04,
  cashShock: 0,
  typicalRegimes: ["REFLATION", "GOLDILOCKS"],
};

const LIQUIDITY_CRISIS: StressScenarioDefinition = {
  id: "LIQUIDITY_CRISIS",
  label: "Liquiditeitscrisis",
  description: "Geen koper meer; bid-ask spreads ontploffen, kleine caps geraakt.",
  assumptions: [
    "Liquide large-caps -15%; small-caps -30%.",
    "Bonds illiquide bij stress — kortlopende OK, lange beweegbaar.",
    "Cash + treasury bills zijn de enige zekere vluchthavens.",
    "Goud kortstondig geraakt (gedwongen verkoop) maar herstelt snel.",
    "Centrale bank-interventie binnen 1-3 weken verwacht.",
  ],
  baselineProbability: "low",
  severity: "extreme",
  sectorShocks: sectorMap(
    {
      tech: -0.22,
      growth: -0.25,
      "consumer-discretionary": -0.20,
      "consumer-staples": -0.10,
      financials: -0.30,
      energy: -0.18,
      materials: -0.20,
      industrials: -0.20,
      healthcare: -0.12,
      "real-estate": -0.25,
      utilities: -0.10,
      communication: -0.18,
    },
    -0.20,
  ),
  currencyShock: -0.05,
  bondShock: -0.05,
  cashShock: 0,
  typicalRegimes: ["DEFLATION"],
};

export const STRESS_SCENARIO_CATALOG: ReadonlyArray<StressScenarioDefinition> =
  [
    RATES_UP_SHARP,
    RECESSION,
    STAGFLATION,
    TECH_SELLOFF,
    ENERGY_CRISIS,
    USD_EUR_SHOCK,
    MARKET_CRASH_20,
    SECTOR_ROTATION,
    LIQUIDITY_CRISIS,
  ];

export function getStressScenario(
  id: StressScenarioDefinition["id"],
): StressScenarioDefinition | null {
  return STRESS_SCENARIO_CATALOG.find((s) => s.id === id) ?? null;
}
