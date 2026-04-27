import type { DashboardAction } from "@/lib/analytics/actions";
import type { AllocationPlan, AllocationSlice } from "@/types/allocation";
import type { Currency } from "@/types/common";
import type { Holding } from "@/types/portfolio";
import type { RebalanceRecommendation } from "@/types/rebalance";

import type { HoldingValuation } from "../valuation";

/**
 * Action Impact Simulator — pure aggregator die de "what if"-vraag
 * beantwoordt: wat gebeurt er als ik de voorgestelde acties uitvoer?
 *
 * Voor elke actie projecteren we de mutatie op `marketValueBase` per
 * positie en cash, en bouwen we een nieuwe verdeling. **Indicatief**:
 *  - Geen orders, geen brokerkoppeling.
 *  - Aantallen + bedragen komen letterlijk uit de reeds bestaande
 *    engines (Rebalance Quantity Engine, Allocation Engine, Action
 *    Engine). Wij rekenen niets opnieuw.
 *  - Risk-score wordt berekend met een pure compositie van bekende
 *    risk-metrics (top-5, foreign-currency, position-weight). We
 *    gebruiken geen historische volatility — die zou her-fitten
 *    vereisen op de gemuteerde portefeuille en is daardoor niet
 *    deterministisch in een synchrone preview.
 *  - Bij ontbrekende data (geen prijzen / geen quantityPlan): de
 *    simulatie skipt die actie en markeert `confidence` lager met
 *    `dataWarnings` toelichting.
 *
 * Reproduceerbaar — zelfde input → zelfde output. Geen AI.
 */

// ============================================================
//  Types
// ============================================================

export interface AllocationDistribution {
  /** Per asset-class, gesorteerd op weight desc. */
  byAssetClass: AllocationSlice[];
  /** Per valuta — incl. cash. */
  byCurrency: AllocationSlice[];
  /** Per sector. */
  bySector: AllocationSlice[];
  /** Totaal portfolio-value (positions + cash) in base currency. */
  totalValue: number;
  /** Cash-balans. */
  cashBalance: number;
}

export interface ConcentrationSnapshot {
  /** Aandeel van top-5 posities (0..1). */
  top5Weight: number;
  /** Grootste-positie-gewicht (0..1). */
  largestPositionWeight: number;
  /** HHI op positie-gewichten (0..1). */
  hhi: number;
}

export interface CurrencyExposureSnapshot {
  /** Aandeel in base currency (incl. cash). 0..1. */
  baseCurrencyWeight: number;
  /** Aandeel in vreemde valuta. 0..1. */
  foreignCurrencyWeight: number;
  /** Top-3 vreemde valuta-buckets. */
  topForeign: AllocationSlice[];
}

export interface ImpactDelta {
  /** Voorbeeld: "Top 5 concentratie daalt van 80% naar 72%". */
  headline: string;
  /** "+3.4%" / "-8.0%" — al-geformatteerde delta-tekst. */
  delta: string;
  /** Positief (verbetering), negatief (verslechtering), neutraal. */
  direction: "improve" | "worsen" | "neutral";
}

export interface ActionImpactSimulation {
  baseCurrency: Currency;
  /** Aantal acties dat is meegenomen (na filtering op data-eisen). */
  appliedActionCount: number;
  /** Aantal acties dat is gesimuleerd; als kleiner dan input → er zijn warnings. */
  totalActionCount: number;
  /** Confidence in de simulatie (0..1) — daalt bij missende data. */
  confidence: number;

  // --- Allocation snapshots ---
  currentAllocation: AllocationDistribution;
  simulatedAllocation: AllocationDistribution;

  // --- Risk snapshots ---
  /** 0..100, hoger = meer risico. */
  currentRiskScore: number;
  simulatedRiskScore: number;

  // --- Concentratie ---
  currentTop5Concentration: ConcentrationSnapshot;
  simulatedTop5Concentration: ConcentrationSnapshot;

  // --- Valuta-exposure ---
  currentCurrencyExposure: CurrencyExposureSnapshot;
  simulatedCurrencyExposure: CurrencyExposureSnapshot;

  /** Top 1-3 belangrijkste verbeteringen (al geformatteerd). */
  impactSummary: ImpactDelta[];
  /** Datakwaliteit-waarschuwingen — bv. "Geen koersdata voor RHM". */
  dataWarnings: string[];
}

export interface SimulateActionImpactInput {
  baseCurrency: Currency;
  holdings: Holding[];
  valuations: HoldingValuation[];
  cashBalance: number;
  /** Dashboard-actions zoals geleverd door `buildDashboardPrimaryActions`. */
  dashboardActions: DashboardAction[];
  /** Rebalance-engine recommendations — gebruikt voor quantityPlan-lookup. */
  rebalanceRecommendations: RebalanceRecommendation[];
  /** Optional allocation plan — gebruikt voor BUY-bedragen wanneer de
   *  dashboard-action zelf geen amount levert. */
  allocationPlan: AllocationPlan | null;
}

// ============================================================
//  Builder
// ============================================================

export function simulateActionImpact(
  input: SimulateActionImpactInput,
): ActionImpactSimulation {
  const baseCurrency = input.baseCurrency;
  const totalCurrent = currentTotalValue(input.valuations, input.cashBalance);

  // 1. Bouw mutatie-tabel: per ticker → delta in base currency.
  const mutations = collectMutations(input);
  const dataWarnings = mutations.warnings.slice();

  // 2. Bouw simulatie-valuations met aangepaste marketValueBase + cash.
  const simulated = applyMutations({
    valuations: input.valuations,
    cashBalance: input.cashBalance,
    mutations: mutations.byTicker,
  });

  // 3. Bouw allocation-snapshots.
  const currentAllocation = buildAllocation({
    valuations: input.valuations,
    cashBalance: input.cashBalance,
    totalValue: totalCurrent,
    baseCurrency,
  });
  const simulatedAllocation = buildAllocation({
    valuations: simulated.valuations,
    cashBalance: simulated.cashBalance,
    totalValue: simulated.totalValue,
    baseCurrency,
  });

  // 4. Concentration vóór/na.
  const currentTop5 = buildConcentration(input.valuations, totalCurrent);
  const simulatedTop5 = buildConcentration(
    simulated.valuations,
    simulated.totalValue,
  );

  // 5. Currency exposure vóór/na.
  const currentCurrency = buildCurrencyExposure({
    valuations: input.valuations,
    cashBalance: input.cashBalance,
    totalValue: totalCurrent,
    baseCurrency,
  });
  const simulatedCurrency = buildCurrencyExposure({
    valuations: simulated.valuations,
    cashBalance: simulated.cashBalance,
    totalValue: simulated.totalValue,
    baseCurrency,
  });

  // 6. Risk-score (composite). Indicatief, geen vol/beta — die hangen
  //    van prijshistorie af die niet pure-functioneel beschikbaar is.
  const currentRisk = computeIndicativeRiskScore({
    top5Weight: currentTop5.top5Weight,
    largestWeight: currentTop5.largestPositionWeight,
    hhi: currentTop5.hhi,
    foreignWeight: currentCurrency.foreignCurrencyWeight,
  });
  const simulatedRisk = computeIndicativeRiskScore({
    top5Weight: simulatedTop5.top5Weight,
    largestWeight: simulatedTop5.largestPositionWeight,
    hhi: simulatedTop5.hhi,
    foreignWeight: simulatedCurrency.foreignCurrencyWeight,
  });

  // 7. Bouw impact-summary uit de drie hoofdas-deltas.
  const impactSummary = buildImpactSummary({
    currentTop5: currentTop5.top5Weight,
    simulatedTop5: simulatedTop5.top5Weight,
    currentRisk,
    simulatedRisk,
    currentForeign: currentCurrency.foreignCurrencyWeight,
    simulatedForeign: simulatedCurrency.foreignCurrencyWeight,
  });

  // 8. Confidence — daalt bij data-warnings of als 0 acties zijn meegenomen.
  const confidence = computeConfidence({
    appliedActions: mutations.appliedCount,
    totalActions: input.dashboardActions.length,
    warnings: dataWarnings,
  });

  return {
    baseCurrency,
    appliedActionCount: mutations.appliedCount,
    totalActionCount: input.dashboardActions.length,
    confidence,
    currentAllocation,
    simulatedAllocation,
    currentRiskScore: round1(currentRisk),
    simulatedRiskScore: round1(simulatedRisk),
    currentTop5Concentration: currentTop5,
    simulatedTop5Concentration: simulatedTop5,
    currentCurrencyExposure: currentCurrency,
    simulatedCurrencyExposure: simulatedCurrency,
    impactSummary,
    dataWarnings,
  };
}

// ============================================================
//  Mutations — pure
// ============================================================

interface MutationsResult {
  /** Per ticker → delta in base currency (positief = bijkopen, negatief = verkopen). */
  byTicker: Map<string, number>;
  /** Cash-delta na alle acties (negatief = gebruikt voor buy). */
  cashDelta: number;
  warnings: string[];
  /** Aantal acties die effectief zijn gesimuleerd (na filteren op data). */
  appliedCount: number;
}

function collectMutations(input: SimulateActionImpactInput): MutationsResult {
  const recByTicker = new Map<string, RebalanceRecommendation>();
  for (const r of input.rebalanceRecommendations) recByTicker.set(r.ticker, r);

  const allocBuyAmount = new Map<string, number>();
  if (input.allocationPlan) {
    for (const r of input.allocationPlan.recommendations ?? []) {
      if (r.action === "buy" || r.action === "add") {
        allocBuyAmount.set(r.ticker, r.suggestedAmount);
      }
    }
  }

  const mutations = new Map<string, number>();
  const warnings: string[] = [];
  let cashDelta = 0;
  let applied = 0;

  for (const action of input.dashboardActions) {
    const ticker = action.symbol;
    if (!ticker) continue; // HOLD_CASH / DO_NOTHING zonder ticker → skip

    if (action.type === "RISK_REDUCTION") {
      // Letterlijk uit rebalance-quantity-engine.
      const plan = recByTicker.get(ticker)?.quantityPlan ?? null;
      if (plan === null || plan.currentPrice === null || plan.amountToSell <= 0) {
        warnings.push(
          `Risk-reduction voor ${ticker}: geen betrouwbare aantallen — actie niet gesimuleerd.`,
        );
        continue;
      }
      mutations.set(
        ticker,
        (mutations.get(ticker) ?? 0) - plan.amountToSell,
      );
      cashDelta += plan.amountToSell;
      applied += 1;
    } else if (action.type === "BUY_OPPORTUNITY") {
      // Voorkeur: action.amount; anders allocation-plan suggestedAmount.
      const amount = action.amount ?? allocBuyAmount.get(ticker) ?? 0;
      if (amount <= 0) {
        warnings.push(
          `Buy-opportunity voor ${ticker}: geen koopbedrag bekend — actie niet gesimuleerd.`,
        );
        continue;
      }
      mutations.set(ticker, (mutations.get(ticker) ?? 0) + amount);
      cashDelta -= amount;
      applied += 1;
    }
    // HOLD_CASH / DO_NOTHING zijn no-op qua mutaties.
  }

  return { byTicker: mutations, cashDelta, warnings, appliedCount: applied };
}

interface ApplyMutationsResult {
  valuations: HoldingValuation[];
  cashBalance: number;
  totalValue: number;
}

function applyMutations(args: {
  valuations: HoldingValuation[];
  cashBalance: number;
  mutations: Map<string, number>;
}): ApplyMutationsResult {
  // We muteren NIET in-place — we maken een shallow copy met aangepaste
  // marketValueBase. Bij bijkopen op een ticker die nog niet bestaat:
  // we maken een synthetische valuation aan zodat asset/sector/currency
  // accountability niet breekt. Voor onbekende-ticker buys (komt voor
  // wanneer allocation-plan een nieuwe ticker voorstelt) hebben we
  // helaas geen `Holding`-record — dan vallen we terug op een
  // generieke "Onbekend" bucket via `null`-fields.
  const seen = new Set<string>();
  const out: HoldingValuation[] = [];

  for (const v of args.valuations) {
    const delta = args.mutations.get(v.holding.ticker) ?? 0;
    const newValue = Math.max(0, v.marketValueBase + delta);
    out.push({ ...v, marketValueBase: newValue });
    seen.add(v.holding.ticker);
  }

  // Nieuwe-ticker buys: voeg toe als synthetische placeholder valuation.
  for (const [ticker, delta] of args.mutations.entries()) {
    if (seen.has(ticker)) continue;
    if (delta <= 0) continue;
    out.push(makeSyntheticValuation(ticker, delta));
  }

  // cashBalance kan negatief worden bij over-budget buys; klem op 0.
  const newCash = Math.max(0, args.cashBalance + computeCashDelta(args.mutations));
  const totalValue =
    out.reduce((sum, v) => sum + v.marketValueBase, 0) + newCash;
  return { valuations: out, cashBalance: newCash, totalValue };
}

function computeCashDelta(mutations: Map<string, number>): number {
  // Som van alle mutations is netto-uitgave (positief = uitgegeven aan
  // bijkopen, negatief = ontvangen uit verkopen). Cash beweegt
  // tegengesteld.
  let netSpent = 0;
  for (const delta of mutations.values()) netSpent += delta;
  return -netSpent;
}

function makeSyntheticValuation(
  ticker: string,
  marketValue: number,
): HoldingValuation {
  // Minimale shape — placeholder Holding zodat allocatie-aggregator niet
  // omvalt. We gebruiken `assetClass: OTHER` en `currency: "EUR"` als
  // veiligste defaults; deze synthetische valuations zijn alleen
  // bedoeld voor allocatie-vergelijking, niet voor display.
  const synthetic: Holding = {
    id: `synthetic-${ticker}`,
    portfolioId: "",
    ticker,
    name: ticker,
    assetClass: "OTHER",
    currency: "EUR",
    quantity: 0,
    avgCostPrice: 0,
  };
  return {
    holding: synthetic,
    unitPrice: 0,
    marketValue,
    marketValueBase: marketValue,
    costBasisBase: marketValue,
    unrealizedPnlBase: 0,
    fxRate: 1,
    priceSource: "costBasis",
    asOf: new Date().toISOString(),
  };
}

// ============================================================
//  Allocation snapshots — pure
// ============================================================

interface BuildAllocationArgs {
  valuations: HoldingValuation[];
  cashBalance: number;
  totalValue: number;
  baseCurrency: Currency;
}

function buildAllocation(args: BuildAllocationArgs): AllocationDistribution {
  const total = args.totalValue;
  if (total <= 0) {
    return {
      byAssetClass: [],
      byCurrency: [],
      bySector: [],
      totalValue: 0,
      cashBalance: args.cashBalance,
    };
  }

  const byAssetClass = aggregateBy(
    args.valuations,
    (v) => v.holding.assetClass,
    total,
    args.cashBalance,
    "CASH",
  );
  const byCurrency = aggregateBy(
    args.valuations,
    (v) => v.holding.currency,
    total,
    args.cashBalance,
    args.baseCurrency,
  );
  const bySector = aggregateBy(
    args.valuations,
    (v) => v.holding.sector ?? "Onbekend",
    total,
    0, // cash heeft geen sector
    null,
  );

  return {
    byAssetClass,
    byCurrency,
    bySector,
    totalValue: total,
    cashBalance: args.cashBalance,
  };
}

function aggregateBy(
  valuations: HoldingValuation[],
  keyFn: (v: HoldingValuation) => string | null | undefined,
  totalValue: number,
  cashBalance: number,
  cashBucket: string | null,
): AllocationSlice[] {
  if (totalValue <= 0) return [];
  const buckets = new Map<string, number>();
  for (const v of valuations) {
    const key = keyFn(v) ?? "Onbekend";
    buckets.set(key, (buckets.get(key) ?? 0) + v.marketValueBase);
  }
  if (cashBucket && cashBalance > 0) {
    buckets.set(cashBucket, (buckets.get(cashBucket) ?? 0) + cashBalance);
  }
  return Array.from(buckets.entries())
    .map(([label, value]) => ({
      label,
      value: round2(value),
      weight: round4(value / totalValue),
    }))
    .sort((a, b) => b.value - a.value);
}

// ============================================================
//  Concentration — pure
// ============================================================

function buildConcentration(
  valuations: HoldingValuation[],
  totalValue: number,
): ConcentrationSnapshot {
  if (totalValue <= 0 || valuations.length === 0) {
    return { top5Weight: 0, largestPositionWeight: 0, hhi: 0 };
  }
  const sortedDesc = [...valuations].sort(
    (a, b) => b.marketValueBase - a.marketValueBase,
  );
  const top5 = sortedDesc
    .slice(0, 5)
    .reduce((s, v) => s + v.marketValueBase, 0);
  const largest = sortedDesc[0]?.marketValueBase ?? 0;
  let hhi = 0;
  for (const v of sortedDesc) {
    const w = v.marketValueBase / totalValue;
    hhi += w * w;
  }
  return {
    top5Weight: round4(top5 / totalValue),
    largestPositionWeight: round4(largest / totalValue),
    hhi: round4(hhi),
  };
}

// ============================================================
//  Currency exposure — pure
// ============================================================

interface BuildCurrencyArgs {
  valuations: HoldingValuation[];
  cashBalance: number;
  totalValue: number;
  baseCurrency: Currency;
}

function buildCurrencyExposure(
  args: BuildCurrencyArgs,
): CurrencyExposureSnapshot {
  if (args.totalValue <= 0) {
    return {
      baseCurrencyWeight: 0,
      foreignCurrencyWeight: 0,
      topForeign: [],
    };
  }
  const buckets = new Map<string, number>();
  for (const v of args.valuations) {
    const key = v.holding.currency;
    buckets.set(key, (buckets.get(key) ?? 0) + v.marketValueBase);
  }
  if (args.cashBalance > 0) {
    buckets.set(
      args.baseCurrency,
      (buckets.get(args.baseCurrency) ?? 0) + args.cashBalance,
    );
  }

  const baseValue = buckets.get(args.baseCurrency) ?? 0;
  const baseWeight = baseValue / args.totalValue;
  const foreignWeight = 1 - baseWeight;

  const topForeign = Array.from(buckets.entries())
    .filter(([label]) => label !== args.baseCurrency)
    .map(([label, value]) => ({
      label,
      value: round2(value),
      weight: round4(value / args.totalValue),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);

  return {
    baseCurrencyWeight: round4(baseWeight),
    foreignCurrencyWeight: round4(Math.max(0, foreignWeight)),
    topForeign,
  };
}

// ============================================================
//  Indicative risk-score — pure
// ============================================================

interface RiskScoreArgs {
  top5Weight: number;
  largestWeight: number;
  hhi: number;
  foreignWeight: number;
}

/**
 * Composite risk-score 0..100 (hoger = meer risico). Componenten:
 *  - top-5 (40%) — concentratie op de zwaarste 5 namen
 *  - largest (25%) — single-positie-gewicht
 *  - HHI (20%) — Herfindahl op alle posities
 *  - foreign currency (15%) — valuta-risico
 *
 * We gebruiken thresholds die consistent zijn met `DEFAULT_RISK_THRESHOLDS`:
 *  - top-5 [40%, 60%]
 *  - position weight [5%, 10%]
 *  - HHI [10%, 20%]
 *  - foreign currency [30%, 60%]
 */
function computeIndicativeRiskScore(args: RiskScoreArgs): number {
  const top5 = piecewise(args.top5Weight, 0.4, 0.6);
  const largest = piecewise(args.largestWeight, 0.05, 0.10);
  const hhi = piecewise(args.hhi, 0.10, 0.20);
  const foreign = piecewise(args.foreignWeight, 0.30, 0.60);
  const score =
    0.40 * top5 + 0.25 * largest + 0.20 * hhi + 0.15 * foreign;
  if (!Number.isFinite(score)) return 50;
  return Math.max(0, Math.min(100, score));
}

function piecewise(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return 50;
  if (value <= low) return 15;
  if (value >= high) return 85;
  return 15 + ((value - low) / (high - low)) * 70;
}

// ============================================================
//  Impact summary — pure
// ============================================================

interface ImpactSummaryArgs {
  currentTop5: number;
  simulatedTop5: number;
  currentRisk: number;
  simulatedRisk: number;
  currentForeign: number;
  simulatedForeign: number;
}

function buildImpactSummary(args: ImpactSummaryArgs): ImpactDelta[] {
  const out: ImpactDelta[] = [];

  const top5Delta = args.simulatedTop5 - args.currentTop5;
  out.push({
    headline: `Top 5 concentratie ${describeChange(args.currentTop5, args.simulatedTop5, "%")}`,
    delta: formatSignedPct(top5Delta * 100),
    direction: directionForLowerIsBetter(top5Delta),
  });

  const riskDelta = args.simulatedRisk - args.currentRisk;
  out.push({
    headline: `Risico-score ${describeChange(args.currentRisk / 100, args.simulatedRisk / 100, "score")}`,
    delta: formatSignedNumber(riskDelta, 1),
    direction: directionForLowerIsBetter(riskDelta),
  });

  const fxDelta = args.simulatedForeign - args.currentForeign;
  out.push({
    headline: `Vreemde valuta ${describeChange(args.currentForeign, args.simulatedForeign, "%")}`,
    delta: formatSignedPct(fxDelta * 100),
    direction: directionForLowerIsBetter(fxDelta),
  });

  // Sorteer op grootste verbetering eerst.
  out.sort((a, b) => deltaMagnitude(b.delta) - deltaMagnitude(a.delta));
  return out;
}

function describeChange(
  current: number,
  simulated: number,
  unit: "%" | "score",
): string {
  if (unit === "%") {
    const c = (current * 100).toFixed(1);
    const s = (simulated * 100).toFixed(1);
    if (simulated < current) return `daalt van ${c}% naar ${s}%`;
    if (simulated > current) return `stijgt van ${c}% naar ${s}%`;
    return `blijft ${c}%`;
  }
  const c = current.toFixed(1);
  const s = simulated.toFixed(1);
  if (simulated < current) return `daalt van ${c} naar ${s}`;
  if (simulated > current) return `stijgt van ${c} naar ${s}`;
  return `blijft ${c}`;
}

function directionForLowerIsBetter(delta: number): ImpactDelta["direction"] {
  if (delta < -1e-9) return "improve";
  if (delta > 1e-9) return "worsen";
  return "neutral";
}

function deltaMagnitude(delta: string): number {
  const num = parseFloat(delta.replace(/[+%\s]/g, ""));
  return Number.isFinite(num) ? Math.abs(num) : 0;
}

function formatSignedPct(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.05) return "±0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatSignedNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.05) return "±0";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}`;
}

// ============================================================
//  Confidence — pure
// ============================================================

function computeConfidence(args: {
  appliedActions: number;
  totalActions: number;
  warnings: string[];
}): number {
  if (args.totalActions === 0) return 0.6; // niets te simuleren — neutraal
  const ratio = args.appliedActions / args.totalActions;
  const warningPenalty = Math.min(0.3, args.warnings.length * 0.1);
  const score = 0.6 + 0.4 * ratio - warningPenalty;
  if (!Number.isFinite(score)) return 0;
  if (score < 0) return 0;
  if (score > 1) return 1;
  return Number(score.toFixed(2));
}

// ============================================================
//  Helpers — pure
// ============================================================

function currentTotalValue(
  valuations: HoldingValuation[],
  cashBalance: number,
): number {
  const positions = valuations.reduce((s, v) => s + v.marketValueBase, 0);
  return positions + cashBalance;
}

function round1(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10_000) / 10_000;
}
