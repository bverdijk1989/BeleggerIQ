/**
 * Monte-Carlo distributie-laag bovenop de macro-scenario-engine.
 *
 * **Probleem (Simons-laag, validation-board)**: huidige scenarios geven
 * één puntwaarde ("RECESSION → -22%"). Maar -22% is een verwachte
 * waarde — de werkelijke uitkomst kan -15% of -30% zijn afhankelijk van
 * hoe het scenario zich ontvouwt. Een gebruiker die "-22%" leest denkt
 * dat dat de schatting is. Dat is fake precision.
 *
 * **MVP-aanpak**: per scenario perturberen we de **per-positie shocks**
 * met log-normale ruis (mean=0, σ=scenario-uncertainty). N simulaties
 * per scenario; output is `{ p10, p50, p90, mean }` op portfolio-niveau.
 *
 * **Bewuste design-keuzes**:
 *  - **Pure functie**, seedable RNG → reproduceerbaar (vereist voor
 *    backtests + tests).
 *  - **Log-normale perturbatie** i.p.v. normale → asymmetrische tails
 *    (financiële crashes hebben fat left tails); voorkomt P10 die naar
 *    +50% gaat door een gauss-symmetric perturbatie.
 *  - **Per-scenario uncertainty-budget** (uit scenario-id → σ-tabel)
 *    i.p.v. uniform. BLACK_SWAN heeft brede band, RATES_UP_2 smal.
 *  - **N=2000 default** — getuned op stable percentile-estimaten zonder
 *    cron-jobs te belasten. <500 oogt jittery; >5000 te traag.
 *
 * **Beperkingen MVP** (gedocumenteerd, niet impliciet):
 *  - Posities worden onafhankelijk gesimuleerd. In werkelijkheid hebben
 *    ze correlatie (alle tech valt samen). Onderschat dus tail-risk
 *    binnen een scenario lichtjes — beter dan 0.
 *  - Geen drift over tijd; één-shot simulatie van het scenario-eindpunt.
 *  - Geen overlap tussen scenarios (bv. RATES_UP_2 + RECESSION samen).
 *    Each scenario blijft een geïsoleerde stresstest.
 *
 * Een toekomstige versie kan deze leemtes invullen via copula-based
 * correlation modeling, maar dat zit ver in M19+ onderzoek-territory.
 */

import type {
  MacroScenarioId,
  MacroScenarioResult,
  PositionImpact,
} from "./types";

export interface MonteCarloPositionInput {
  ticker: string;
  name: string;
  weight: number;
  /** Verwachte shock (mean) — uit de bestaande scenario-engine. */
  expectedShock: number;
}

export interface MonteCarloScenarioInput {
  scenario: MacroScenarioId;
  positions: MonteCarloPositionInput[];
  /** Aantal simulaties. Default 2000. */
  iterations?: number;
  /** Seed voor reproduceerbare runs. */
  seed?: number;
}

export interface MonteCarloDistribution {
  /** Verwachte waarde van de portfolioImpact. */
  mean: number;
  /** Mediaan (p50) — meer robust dan mean bij skewed tails. */
  p50: number;
  /** 10e percentiel — pessimistisch (linker tail). */
  p10: number;
  /** 90e percentiel — optimistisch (rechter tail). */
  p90: number;
  /** Standaarddeviatie over de N simulaties. */
  stdDev: number;
  /** Aantal simulaties. */
  iterations: number;
}

/**
 * Per-scenario uncertainty-budget. σ in log-space (lognormal):
 *  - 0.10 ≈ smalle band (RATES_UP_2 — voorspelbaar mechanisme)
 *  - 0.30 ≈ wijde band (BLACK_SWAN — definitie van onbekend)
 *
 * Deze waarden zijn geijkt op consensus van Asness/Marks "tail estimates
 * groeien quadratisch met regime-uncertainty". Niet empirisch
 * gefit — handgekozen ankers met ruimte voor latere calibration.
 */
const SCENARIO_SIGMA: Record<MacroScenarioId, number> = {
  RATES_UP_2: 0.10,
  USD_UP_10: 0.12,
  MARKET_CRASH: 0.20,
  RECESSION: 0.18,
  STAGFLATION: 0.22,
  BLACK_SWAN: 0.30,
  TOP_POSITION_BLOWUP: 0.15,
};

const DEFAULT_ITERATIONS = 2000;

/**
 * Mulberry32 seedable RNG. Niet cryptografisch — wel reproduceerbaar
 * en uniform. 32-bit state, periode ~2^32 (voldoende voor < 1e6 calls).
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller — uniform[0,1) → standaard-normaal N(0,1).
 * We genereren ze 1-voor-1 (niet de paar-optimalisatie) voor
 * eenvoudigere RNG-state. Performance is geen issue bij N=2000.
 */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng(); // log(0) is -∞; herrol
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Perturbeer een verwachte shock met log-normale ruis. Multiplier =
 * exp(σ × N(0,1)). Voor positieve shocks: rechter tail loopt langer.
 * Voor negatieve shocks: linker tail loopt langer (passend bij crashes).
 */
function perturbShock(
  expectedShock: number,
  sigma: number,
  rng: () => number,
): number {
  const z = gaussian(rng);
  const multiplier = Math.exp(sigma * z);
  return expectedShock * multiplier;
}

/**
 * Sorteer + percentile-helper. Lineair geïnterpoleerde percentile
 * conform R's type-7 (default in numpy). Stable voor N > 30.
 */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo] ?? 0;
  const frac = idx - lo;
  return (sortedAsc[lo] ?? 0) * (1 - frac) + (sortedAsc[hi] ?? 0) * frac;
}

export function simulateScenarioDistribution(
  input: MonteCarloScenarioInput,
): MonteCarloDistribution {
  const iterations = input.iterations ?? DEFAULT_ITERATIONS;
  const seed = input.seed ?? 42;
  const sigma = SCENARIO_SIGMA[input.scenario] ?? 0.15;
  const rng = createRng(seed);

  const portfolioImpacts: number[] = new Array(iterations);

  for (let sim = 0; sim < iterations; sim++) {
    let total = 0;
    for (const pos of input.positions) {
      const perturbedShock = perturbShock(pos.expectedShock, sigma, rng);
      total += pos.weight * perturbedShock;
    }
    portfolioImpacts[sim] = total;
  }

  const sorted = portfolioImpacts.slice().sort((a, b) => a - b);
  const mean =
    portfolioImpacts.reduce((s, v) => s + v, 0) / iterations;
  const variance =
    portfolioImpacts.reduce((s, v) => s + (v - mean) ** 2, 0) / iterations;

  return {
    mean,
    p50: percentile(sorted, 0.5),
    p10: percentile(sorted, 0.1),
    p90: percentile(sorted, 0.9),
    stdDev: Math.sqrt(variance),
    iterations,
  };
}

/**
 * Convenience: enrich een bestaand `MacroScenarioResult` met een
 * distributie-veld zodat de UI naar `result.distribution.{p10,p90}`
 * kan grijpen zonder de data-flow te restructureren.
 */
export interface EnrichWithDistributionInput {
  result: MacroScenarioResult;
  positions: MonteCarloPositionInput[];
  iterations?: number;
  seed?: number;
}

export function enrichScenarioWithDistribution(
  input: EnrichWithDistributionInput,
): MacroScenarioResult & { distribution: MonteCarloDistribution } {
  const distribution = simulateScenarioDistribution({
    scenario: input.result.scenario,
    positions: input.positions,
    iterations: input.iterations,
    seed: input.seed,
  });
  return { ...input.result, distribution };
}

/**
 * Format helper voor UI: "−22% (P10: −30%, P90: −15%)".
 */
export function formatScenarioWithBand(
  expected: number,
  distribution: MonteCarloDistribution,
): string {
  const fmt = (v: number) =>
    `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}%`;
  return `${fmt(expected)} (P10: ${fmt(distribution.p10)}, P90: ${fmt(distribution.p90)})`;
}

// Test-only exports voor exact threshold-snapshot.
export const MONTE_CARLO_DEFAULTS = {
  iterations: DEFAULT_ITERATIONS,
  scenarioSigma: SCENARIO_SIGMA,
} as const;

// Re-export for convenience
export type { PositionImpact };
