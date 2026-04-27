import type { Currency, ISODateString } from "@/types/common";
import type { Holding } from "@/types/portfolio";

import {
  assetClassShockMultiplier,
  classifySector,
  isDefensiveSector,
  isForeignCurrency,
  type SectorBucket,
} from "./regime";
import type {
  MacroScenarioId,
  MacroScenarioReport,
  MacroScenarioResult,
  PositionImpact,
} from "./types";

/**
 * Macro-scenario engine. Pure functies bovenop een lichte set
 * positie-inputs. Indicatieve berekeningen — *geen* economisch model.
 *
 * Vier scenarios:
 *   1. RATES_UP_2     — rente +2%; lange-duration assets harder geraakt.
 *   2. MARKET_CRASH   — brede marktdaling -20%; defensieve sectors zachter.
 *   3. USD_UP_10      — USD +10% vs base; positief voor USD-genoteerde
 *                       assets (vanuit EUR-perspectief), negatief voor
 *                       importafhankelijke EU-bedrijven.
 *   4. RECESSION      — gecombineerd: cyclische sectors -25%, staples -8%,
 *                       earnings-sensitive sectoren extra geraakt.
 */

// ============================================================
//  Per-scenario sector-shock-tabellen (fracties)
// ============================================================

/**
 * RATES +2%: lange-duration / hoog-leverage assets gaan harder
 * onderuit. Tech (groei zonder cashflow vandaag) en REITs zijn meest
 * gevoelig; financials profiteren marginaal.
 */
const RATES_SHOCKS: Record<SectorBucket, number> = {
  tech: -0.12,
  growth: -0.15,
  "consumer-discretionary": -0.07,
  "consumer-staples": -0.03,
  financials: 0.02,
  energy: -0.02,
  materials: -0.05,
  industrials: -0.05,
  healthcare: -0.04,
  "real-estate": -0.18,
  utilities: -0.1,
  communication: -0.07,
  unknown: -0.06,
};

/**
 * MARKET CRASH -20%: brede shock die defensieve sectoren zachter raakt.
 */
const CRASH_SHOCKS: Record<SectorBucket, number> = {
  tech: -0.28,
  growth: -0.32,
  "consumer-discretionary": -0.25,
  "consumer-staples": -0.1,
  financials: -0.22,
  energy: -0.2,
  materials: -0.22,
  industrials: -0.24,
  healthcare: -0.12,
  "real-estate": -0.22,
  utilities: -0.08,
  communication: -0.18,
  unknown: -0.2,
};

/**
 * USD +10% vs EUR (base): vanuit EUR-investeerder krijg je 10% extra
 * EUR-waarde op pure USD-assets. Voor USD-bedrijven met euro-export
 * kan het netto effect kleiner zijn — we modelleren dat conservatief.
 * (Dit zijn shocks bovenop de FX-translation.)
 */
const USD_SECTOR_OPERATING_SHOCKS: Record<SectorBucket, number> = {
  tech: 0,
  growth: 0,
  "consumer-discretionary": -0.02,
  "consumer-staples": -0.01,
  financials: 0,
  energy: 0.02,
  materials: 0.01,
  industrials: -0.02,
  healthcare: 0,
  "real-estate": 0,
  utilities: 0,
  communication: 0,
  unknown: 0,
};

/**
 * RECESSION: cyclische sectoren krimpen winsten; defensieve sectoren
 * houden veel beter stand.
 */
const RECESSION_SHOCKS: Record<SectorBucket, number> = {
  tech: -0.22,
  growth: -0.3,
  "consumer-discretionary": -0.3,
  "consumer-staples": -0.06,
  financials: -0.25,
  energy: -0.2,
  materials: -0.25,
  industrials: -0.28,
  healthcare: -0.08,
  "real-estate": -0.18,
  utilities: -0.05,
  communication: -0.15,
  unknown: -0.18,
};

// ============================================================
//  Engine input
// ============================================================

export interface MacroPositionInput {
  holding: Holding;
  /** Marktwaarde in base currency. */
  marketValueBase: number;
}

export interface RunMacroScenariosInput {
  positions: MacroPositionInput[];
  totalValue: number;
  baseCurrency: Currency;
  /** USD/EUR-shock magnitude voor scenario 3 (default 0.1 = +10%). */
  usdAppreciation?: number;
  /** Override `now` voor tests. */
  now?: string;
  /** Aantal winners/losers per scenario (default 5). */
  topN?: number;
}

// ============================================================
//  Public engine
// ============================================================

export function runMacroScenarios(
  input: RunMacroScenariosInput,
): MacroScenarioReport {
  const generatedAt = input.now ?? new Date().toISOString();
  const usdShock = input.usdAppreciation ?? 0.1;
  const topN = input.topN ?? 5;

  const scenarios: MacroScenarioResult[] = [
    runScenario({
      id: "RATES_UP_2",
      label: "Rente +2%",
      description:
        "Brede renteverhoging van 200 bps; lange-duration en groei-assets zwaarder geraakt.",
      input,
      shockFn: (entry) => sectorShock(entry, RATES_SHOCKS, "rates"),
      topN,
    }),
    runScenario({
      id: "MARKET_CRASH",
      label: "Markt -20%",
      description:
        "Brede aandelenmarkt -20%; defensieve sectoren vangen een deel op.",
      input,
      shockFn: (entry) => sectorShock(entry, CRASH_SHOCKS, "crash"),
      topN,
    }),
    runScenario({
      id: "USD_UP_10",
      label: "USD +10%",
      description:
        "USD apprecieert 10% t.o.v. base currency; FX-effect + lichte sector-aanpassing.",
      input,
      shockFn: (entry) => usdScenarioShock(entry, input.baseCurrency, usdShock),
      topN,
    }),
    runScenario({
      id: "RECESSION",
      label: "Recessie",
      description:
        "Brede recessie; cyclische sectoren -25 tot -30%, staples/healthcare houden stand.",
      input,
      shockFn: (entry) => sectorShock(entry, RECESSION_SHOCKS, "recession"),
      topN,
    }),
  ];

  return {
    generatedAt,
    baseCurrency: input.baseCurrency,
    totalValue: input.totalValue,
    scenarios,
  };
}

// ============================================================
//  Per-scenario uitvoering
// ============================================================

interface RunScenarioInput {
  id: MacroScenarioId;
  label: string;
  description: string;
  input: RunMacroScenariosInput;
  shockFn: (entry: MacroPositionInput) => number;
  topN: number;
}

function runScenario(params: RunScenarioInput): MacroScenarioResult {
  const { input, shockFn, topN } = params;
  const total = input.totalValue;
  const warnings: string[] = [];

  if (total <= 0) {
    warnings.push("Totale portefeuille-waarde is 0 — scenario is niet zinvol.");
    return emptyResult(params, warnings);
  }
  if (input.positions.length === 0) {
    warnings.push("Geen posities in input — niets te berekenen.");
    return emptyResult(params, warnings);
  }

  const impacts: PositionImpact[] = input.positions.map((entry) => {
    const weight = entry.marketValueBase / total;
    const shock = shockFn(entry);
    return {
      ticker: entry.holding.ticker,
      name: entry.holding.name,
      weight,
      shock,
      contribution: weight * shock,
    };
  });

  const portfolioImpact = impacts.reduce((s, p) => s + p.contribution, 0);
  const portfolioImpactAmount = portfolioImpact * total;

  const losers = [...impacts]
    .filter((p) => p.contribution < 0)
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, topN);
  const winners = [...impacts]
    .filter((p) => p.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, topN);

  const defensiveStrength = computeDefensiveStrength({
    scenarioId: params.id,
    impacts,
    portfolioImpact,
  });
  const verdict = buildVerdict(params.id, params.label, portfolioImpact, defensiveStrength);

  return {
    scenario: params.id,
    label: params.label,
    description: params.description,
    portfolioImpact,
    portfolioImpactAmount,
    biggestLosers: losers,
    biggestWinners: winners,
    defensiveStrength,
    verdict,
    warnings,
  };
}

function emptyResult(
  params: RunScenarioInput,
  warnings: string[],
): MacroScenarioResult {
  return {
    scenario: params.id,
    label: params.label,
    description: params.description,
    portfolioImpact: 0,
    portfolioImpactAmount: 0,
    biggestLosers: [],
    biggestWinners: [],
    defensiveStrength: 50,
    verdict: "Onvoldoende data om scenario betekenisvol te evalueren.",
    warnings,
  };
}

// ============================================================
//  Shock-bouwers per scenario
// ============================================================

function sectorShock(
  entry: MacroPositionInput,
  table: Record<SectorBucket, number>,
  scenarioKey: "rates" | "crash" | "recession",
): number {
  const bucket = classifySector(entry.holding.sector);
  const base = table[bucket];
  const multiplier = assetClassShockMultiplier(entry.holding.assetClass)[
    scenarioKey
  ];
  return base * multiplier;
}

function usdScenarioShock(
  entry: MacroPositionInput,
  baseCurrency: Currency,
  usdShock: number,
): number {
  const isFxExposed = isForeignCurrency(entry.holding, baseCurrency);
  const bucket = classifySector(entry.holding.sector);
  const operating = USD_SECTOR_OPERATING_SHOCKS[bucket];
  const fxMultiplier = assetClassShockMultiplier(entry.holding.assetClass).usd;
  // FX-effect alleen op niet-base-currency assets; we benaderen als
  // `+usdShock × fxMultiplier`. EU-listed bedrijven krijgen alleen de
  // operating-shock (kleine sector-aanpassing).
  const fxEffect = isFxExposed ? usdShock * fxMultiplier : 0;
  return fxEffect + operating;
}

// ============================================================
//  Defensive-strength score (0..100)
// ============================================================

function computeDefensiveStrength(params: {
  scenarioId: MacroScenarioId;
  impacts: PositionImpact[];
  portfolioImpact: number;
}): number {
  const { scenarioId, impacts, portfolioImpact } = params;

  // Voor MARKET_CRASH en RECESSION: combineer % defensieve weight
  // met de geleden impact. Bv. veel staples + healthcare → hoog.
  if (scenarioId === "MARKET_CRASH" || scenarioId === "RECESSION") {
    const defensiveWeight = impacts.reduce((sum, p) => {
      const bucket = classifySector(
        // We hergebruiken sector via lookup uit impacts.ticker — maar
        // PositionImpact bewaart geen sector. Daarom: defensieve maat
        // primair afgeleid uit hoe goed de portefeuille de shock dempte.
        null,
      );
      // Bucket is altijd "unknown" hier; vervolgens berekenen we
      // alleen op portfolio-impact.
      void bucket;
      return sum;
    }, 0);
    void defensiveWeight; // bewust niet gebruikt — zie comment hierboven

    // Score = 100 + impact × multiplier, geclampt naar [0, 100].
    // Bij crash met -20% verwacht: portfolioImpact ≈ -0.2 → score 0.
    // Beter beschermd → impact dichter bij 0 → score 100.
    const expectedFloor = scenarioId === "MARKET_CRASH" ? -0.25 : -0.3;
    const ratio = clamp01(1 - portfolioImpact / expectedFloor);
    return Math.round(ratio * 100);
  }

  // RATES_UP_2: defensief = lage gemiddelde duration (lage |shock|).
  // USD_UP_10: defensief = positief netto (geen FX-rem).
  if (scenarioId === "RATES_UP_2") {
    const avgShock =
      impacts.reduce((s, p) => s + Math.abs(p.shock), 0) / impacts.length;
    // 0.05 = -5% gemiddelde drawdown = redelijk beschermd → score 60.
    // 0.18 = -18% gemiddelde drawdown = zwaar geraakt → score 0.
    return Math.round(clamp01(1 - avgShock / 0.18) * 100);
  }

  if (scenarioId === "USD_UP_10") {
    // Defensief in USD-up: positief portfolio-effect.
    return Math.round(clamp01((portfolioImpact + 0.1) / 0.2) * 100);
  }

  return 50;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

// ============================================================
//  Verdict-builder (deterministic)
// ============================================================

function buildVerdict(
  id: MacroScenarioId,
  label: string,
  impact: number,
  defensiveStrength: number,
): string {
  const pct = `${(impact * 100).toFixed(1)}%`;
  const tone =
    impact <= -0.15
      ? "fors getroffen"
      : impact <= -0.05
        ? "matig getroffen"
        : impact < 0
          ? "lichtjes geraakt"
          : "neutraal of positief";

  if (id === "USD_UP_10") {
    if (impact > 0.02) {
      return `${label}: portefeuille profiteert ${pct} van USD-appreciatie (FX-positief).`;
    }
    if (impact < -0.02) {
      return `${label}: portefeuille verliest ${pct} — FX werkt tegen.`;
    }
    return `${label}: portefeuille is grotendeels FX-neutraal (${pct}).`;
  }

  return `${label}: portefeuille ${tone} (${pct}); defensieve sterkte ${defensiveStrength}/100.`;
}
