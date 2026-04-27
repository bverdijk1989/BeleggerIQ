import type {
  BusinessLabel,
  BusinessQualityResult,
} from "@/lib/analytics/business";
import type { FactorScore } from "@/types/factor";
import type { Holding } from "@/types/portfolio";

/**
 * Business Quality summary — pure aggregator over de output van de
 * Business Quality Layer (`computeBusinessQualityBatch`).
 *
 * Doel: het dashboard moet in één blik tonen:
 *   - welke posities sterk zijn (compounders)
 *   - welke posities cyclisch of speculatief zijn (warnings)
 *   - welke posities je waarschijnlijk 10 jaar kunt houden
 *
 * Reproduceerbaar: identieke input → identieke output. Geen AI. AI mag
 * later bullets per kaart uitleggen via een explain-knop, maar de
 * scores en labels komen *uitsluitend* uit de Business Quality Layer.
 *
 * Strategie:
 *   1. Verrijk elke `BusinessQualityResult` met portfolio-context
 *      (currentWeight uit holdings, sector, factor-confidence).
 *   2. Filter op asset-class: alleen EQUITY / REIT (single companies).
 *      ETFs/Bonds/Crypto/Cash hebben geen "business quality" in de
 *      Buffett-zin; we sluiten ze uit zodat de rij niet vervuilt wordt.
 *   3. Buckets:
 *      - **strongestBusinesses** — top 3 op score; alleen wanneer
 *        confidence ≥ 0.5 én score ≥ 60 (anders weergeven we
 *        twijfelachtige sterkte).
 *      - **weakestBusinesses** — bodem 3 op score (score ≤ 50).
 *      - **longTermHoldCandidates** — `canHoldLongTerm === true`,
 *        gesorteerd op weight desc (waar de gebruiker het meest in
 *        zit, eerst).
 *      - **speculativeWarnings** — alle posities met label
 *        SPECULATIVE óf CYCLICAL waarvan weight ≥ 5%; gesorteerd op
 *        weight desc.
 *   4. Bouw `confidence` als gewogen gemiddelde van per-positie
 *      confidence (gewicht = currentWeight). UI toont waarschuwing
 *      wanneer confidence < 0.5 of meer dan 30% van de portefeuille
 *      ontbreekt aan business-quality data.
 */

// ============================================================
//  Types
// ============================================================

export type BusinessQualityNL =
  | "Sterk bedrijf"
  | "Cyclisch"
  | "Speculatief"
  | "Langetermijnhouder";

export interface DashboardBusinessQualityItem {
  ticker: string;
  name: string;
  sector: string | null;
  /** 0..1 — currentWeight in portefeuille. */
  weight: number;
  /** 0..100. */
  score: number;
  /** Originele engine-label (COMPOUNDER/CYCLICAL/SPECULATIVE). */
  label: BusinessLabel;
  /** NL-label dat de UI direct kan tonen. */
  labelNL: BusinessQualityNL;
  /** True wanneer de engine dit als 10y-holdable beoordeelt. */
  canHoldLongTerm: boolean;
  /** 0..1 — coverage uit business-quality + factor-confidence (avg). */
  confidence: number;
  /** Eerste rationale-bullet uit de moat-pijler — explainability. */
  topRationale: string;
  /** Engine-warnings (cyclisch sector, low coverage, ...). */
  warnings: string[];
}

export interface BusinessQualitySummary {
  /** Top-3 bedrijven met sterkste compounder-profiel. */
  strongestBusinesses: DashboardBusinessQualityItem[];
  /** Bodem-3 bedrijven met laagste score. */
  weakestBusinesses: DashboardBusinessQualityItem[];
  /** Alle 10y-houders, weight-desc gesorteerd. */
  longTermHoldCandidates: DashboardBusinessQualityItem[];
  /** Materiële (≥ 5% weight) speculatieve/cyclische posities. */
  speculativeWarnings: DashboardBusinessQualityItem[];
  /** Aantal evalueerbare posities (na asset-class-filter). */
  evaluatedCount: number;
  /** Aantal holdings dat is overgeslagen (asset-class niet eligible). */
  skippedCount: number;
  /** Weight-gewogen gemiddelde confidence (0..1). */
  overallConfidence: number;
  /** Fractie portefeuille waar business-quality niet betrouwbaar is. */
  uncoveredWeight: number;
  /** Algemene data-warnings die boven de kaarten kunnen worden getoond. */
  warnings: string[];
}

export interface SummarizeBusinessQualityInput {
  /** Output uit `computeBusinessQualityBatch.ranked`. */
  results: BusinessQualityResult[];
  /** Holdings uit `Portfolio` — voor weight, name, sector, assetClass. */
  holdings: Holding[];
  /** Optioneel: factor-scores per ticker — boost confidence wanneer beschikbaar. */
  factorScores?: Map<string, FactorScore>;
  /** Marketvalues per ticker (base currency) — voor weight-berekening. */
  marketValueByTicker: Map<string, number>;
  /** Totale portefeuille-waarde in base currency (incl. cash). */
  totalValue: number;
  /** Default 3. */
  topN?: number;
}

// ============================================================
//  Drempels (expliciet)
// ============================================================

const STRONG_MIN_SCORE = 60;
const STRONG_MIN_CONFIDENCE = 0.5;
const WEAK_MAX_SCORE = 50;
const SPECULATIVE_WARN_MIN_WEIGHT = 0.05;
const LOW_CONFIDENCE_PORTFOLIO = 0.5;
const UNCOVERED_PORTFOLIO_THRESHOLD = 0.30;

const ELIGIBLE_ASSET_CLASSES: ReadonlySet<Holding["assetClass"]> = new Set([
  "EQUITY",
  "REIT",
]);

const LABEL_TO_NL: Record<BusinessLabel, BusinessQualityNL> = {
  COMPOUNDER: "Sterk bedrijf",
  CYCLICAL: "Cyclisch",
  SPECULATIVE: "Speculatief",
};

// ============================================================
//  Builder
// ============================================================

export function summarizeBusinessQuality(
  input: SummarizeBusinessQualityInput,
): BusinessQualitySummary {
  const topN = input.topN ?? 3;
  const holdingByTicker = new Map(
    input.holdings.map((h) => [h.ticker, h]),
  );

  const eligible: DashboardBusinessQualityItem[] = [];
  const skippedTickers: string[] = [];

  for (const result of input.results) {
    const holding = holdingByTicker.get(result.ticker);
    if (!holding || !ELIGIBLE_ASSET_CLASSES.has(holding.assetClass)) {
      skippedTickers.push(result.ticker);
      continue;
    }
    const value = input.marketValueByTicker.get(result.ticker) ?? 0;
    const weight =
      input.totalValue > 0 ? Math.max(0, value / input.totalValue) : 0;
    eligible.push(
      buildItem({
        result,
        holding,
        weight,
        factorScore: input.factorScores?.get(result.ticker) ?? null,
      }),
    );
  }

  // 1) strongestBusinesses — top-N op score, met confidence/score-floor.
  const strongest = [...eligible]
    .filter(
      (e) =>
        e.label === "COMPOUNDER" ||
        (e.score >= STRONG_MIN_SCORE && e.confidence >= STRONG_MIN_CONFIDENCE),
    )
    .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
    .slice(0, topN);

  // 2) weakestBusinesses — bodem-N op score.
  const weakest = [...eligible]
    .filter((e) => e.score <= WEAK_MAX_SCORE)
    .sort((a, b) => a.score - b.score || a.ticker.localeCompare(b.ticker))
    .slice(0, topN);

  // 3) longTermHoldCandidates — engine-canonical 10y-flag.
  const longTerm = [...eligible]
    .filter((e) => e.canHoldLongTerm)
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        b.score - a.score ||
        a.ticker.localeCompare(b.ticker),
    );

  // 4) speculativeWarnings — materiële weight (≥ 5%) + label
  //    SPECULATIVE / CYCLICAL.
  const speculative = [...eligible]
    .filter(
      (e) =>
        (e.label === "SPECULATIVE" || e.label === "CYCLICAL") &&
        e.weight >= SPECULATIVE_WARN_MIN_WEIGHT,
    )
    .sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker));

  const overallConfidence = computeWeightedConfidence(eligible);
  const uncoveredWeight = computeUncoveredWeight({
    holdings: input.holdings,
    marketValueByTicker: input.marketValueByTicker,
    totalValue: input.totalValue,
    eligible,
  });

  const warnings = buildSummaryWarnings({
    overallConfidence,
    uncoveredWeight,
    skippedCount: skippedTickers.length,
    evaluatedCount: eligible.length,
  });

  return {
    strongestBusinesses: strongest,
    weakestBusinesses: weakest,
    longTermHoldCandidates: longTerm,
    speculativeWarnings: speculative,
    evaluatedCount: eligible.length,
    skippedCount: skippedTickers.length,
    overallConfidence: round2(overallConfidence),
    uncoveredWeight: round4(uncoveredWeight),
    warnings,
  };
}

// ============================================================
//  Item builder (pure)
// ============================================================

interface BuildItemContext {
  result: BusinessQualityResult;
  holding: Holding;
  weight: number;
  factorScore: FactorScore | null;
}

function buildItem(ctx: BuildItemContext): DashboardBusinessQualityItem {
  const labelNL = ctx.result.canHoldLongTerm
    ? "Langetermijnhouder"
    : LABEL_TO_NL[ctx.result.label];

  // Combineer confidence-bronnen: business-quality coverage is primary,
  // factor-confidence (indien aanwezig) als secundaire bron. We pakken
  // het rekenkundig gemiddelde — beide engines vertellen iets over data-
  // betrouwbaarheid van een ander aspect (fundamentals vs. factor input).
  const factorConfidence = clamp01(ctx.factorScore?.confidence ?? null);
  const combinedConfidence =
    factorConfidence === null
      ? clamp01(ctx.result.confidence) ?? 0
      : ((clamp01(ctx.result.confidence) ?? 0) + factorConfidence) / 2;

  const topRationale = pickTopRationale(ctx.result);

  return {
    ticker: ctx.result.ticker,
    name: ctx.holding.name ?? ctx.result.ticker,
    sector: ctx.holding.sector ?? null,
    weight: round4(ctx.weight),
    score: ctx.result.businessQualityScore,
    label: ctx.result.label,
    labelNL,
    canHoldLongTerm: ctx.result.canHoldLongTerm,
    confidence: round2(combinedConfidence),
    topRationale,
    warnings: ctx.result.warnings.slice(),
  };
}

function pickTopRationale(result: BusinessQualityResult): string {
  // Pak de rationale-bullet uit de pillar met de hoogste sub-score —
  // dat is de meest informatieve regel voor "waarom oogt dit goed".
  const pillars: Array<{ score: number; bullets: string[] }> = [
    { score: result.moatScore, bullets: result.rationale.moat },
    { score: result.earningsStability, bullets: result.rationale.earnings },
    { score: result.capitalEfficiency, bullets: result.rationale.capital },
  ];
  pillars.sort((a, b) => b.score - a.score);
  for (const p of pillars) {
    if (p.bullets.length > 0) return p.bullets[0]!;
  }
  return "Geen rationale beschikbaar.";
}

// ============================================================
//  Aggregations (pure)
// ============================================================

function computeWeightedConfidence(
  items: DashboardBusinessQualityItem[],
): number {
  let totalWeight = 0;
  let weightedSum = 0;
  for (const i of items) {
    totalWeight += i.weight;
    weightedSum += i.confidence * i.weight;
  }
  if (totalWeight <= 0) return 0;
  return weightedSum / totalWeight;
}

interface UncoveredArgs {
  holdings: Holding[];
  marketValueByTicker: Map<string, number>;
  totalValue: number;
  eligible: DashboardBusinessQualityItem[];
}

function computeUncoveredWeight(args: UncoveredArgs): number {
  // "Uncovered" = som van weight van EQUITY/REIT-holdings die wél
  // eligible zijn maar waarvan de business-quality confidence < 0.3.
  // Niet-evalueerbare assets (ETF/Bond/Crypto) tellen niet mee — we
  // beweren niet dat een ETF "weak business quality" heeft.
  if (args.totalValue <= 0) return 0;
  let uncovered = 0;
  for (const item of args.eligible) {
    if (item.confidence < 0.3) uncovered += item.weight;
  }
  // Daarnaast: holdings die wel EQUITY/REIT zijn maar geen result in de
  // batch hadden (bv. ticker uitgevallen). Die tellen óók als uncovered.
  const evaluated = new Set(args.eligible.map((e) => e.ticker));
  for (const h of args.holdings) {
    if (!ELIGIBLE_ASSET_CLASSES.has(h.assetClass)) continue;
    if (evaluated.has(h.ticker)) continue;
    const value = args.marketValueByTicker.get(h.ticker) ?? 0;
    uncovered += Math.max(0, value / args.totalValue);
  }
  return Math.min(1, uncovered);
}

interface BuildWarningsArgs {
  overallConfidence: number;
  uncoveredWeight: number;
  skippedCount: number;
  evaluatedCount: number;
}

function buildSummaryWarnings(args: BuildWarningsArgs): string[] {
  const out: string[] = [];
  if (args.evaluatedCount === 0) {
    out.push(
      "Geen single-stock posities (EQUITY/REIT) in deze portefeuille — Business Quality Layer heeft niets te scoren.",
    );
    return out;
  }
  if (args.overallConfidence < LOW_CONFIDENCE_PORTFOLIO) {
    out.push(
      `Business-quality data is beperkt betrouwbaar (gewogen confidence ${(args.overallConfidence * 100).toFixed(0)}%). Vul fundamentals aan voor scherpere labels.`,
    );
  }
  if (args.uncoveredWeight >= UNCOVERED_PORTFOLIO_THRESHOLD) {
    out.push(
      `${(args.uncoveredWeight * 100).toFixed(0)}% van de portefeuille mist betrouwbare business-quality data — interpreteer labels voorzichtig.`,
    );
  }
  return out;
}

// ============================================================
//  Helpers (pure)
// ============================================================

function clamp01(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10_000) / 10_000;
}
