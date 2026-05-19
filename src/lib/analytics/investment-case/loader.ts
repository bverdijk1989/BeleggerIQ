/**
 * Investment Case — server-side loader (Module 31).
 *
 * Hydrateert pure engine vanuit:
 *  - holding (assetClass + classification + sector)
 *  - fundamentals via getFundamentals
 *  - factor-score uit view.factorScores
 *  - confidence uit loadConfidenceScore (optioneel; alleen wanneer view gegeven)
 *  - data-depth uit M26 computeAssetDataDepth
 *  - portfolio-context uit view.summary + view.risk
 *  - enrichment voor sector/industry/country/businessSummary
 *
 * **Faal-safe**: elke sub-fetch wrapped in try/catch met sensible defaults.
 * **Geen verzonnen feiten**: bij ontbrekende data → field=null en de
 * engine markeert de card als "missing".
 */

import { computeAssetDataDepth } from "@/lib/analytics/data-depth";
import type { PortfolioView } from "@/lib/analytics/portfolio-view";
import { loadConfidenceScore } from "@/lib/analytics/signal-fusion";
import { enrichInstrument } from "@/lib/data/instrument-enrichment";
import { getFundamentals } from "@/lib/data/fundamentals";
import { getHistory } from "@/lib/data/history";
import { log } from "@/lib/log";

import { buildInvestmentCase } from "./engine";
import type { InvestmentCase } from "./types";

const HISTORY_MIN_POINTS = 60;

export interface LoadInvestmentCaseInput {
  ticker: string;
  /** Optionele portfolio-view voor portfolio-fit + factor-score context. */
  view?: PortfolioView | null;
  /** Heuristiek: hasMacroRegime defaultt op true (regime-engine draait altijd). */
  hasMacroRegime?: boolean;
}

export async function loadInvestmentCase(
  input: LoadInvestmentCaseInput,
): Promise<InvestmentCase> {
  const ticker = input.ticker.toUpperCase();
  const generatedAt = new Date().toISOString();

  // 1) Enrichment voor sector/industry/country (+ optional businessSummary
  // via Yahoo assetProfile.longBusinessSummary — die slaat enrichment NIET
  // op in cache; we accepteren dat fundamentals/classification de hoofd-bronnen
  // zijn voor v1).
  const enrichment = await enrichInstrument({ ticker }).catch(() => null);

  // 2) Fundamentals (faal-safe).
  const fundamentals = await getFundamentals(ticker).catch(() => null);

  // 3) Holding-context wanneer in user's view.
  const valuation = input.view?.valuations.find(
    (v) => v.holding.ticker.toUpperCase() === ticker,
  );
  const holding = valuation?.holding ?? null;
  const totalValue = input.view?.summary.totalValue ?? 0;
  const weight =
    valuation && totalValue > 0
      ? valuation.marketValueBase / totalValue
      : null;

  // 4) Confidence-score — pure, gebruikt fundamentals + view.
  let confidence = null;
  try {
    const res = await loadConfidenceScore({ ticker, view: input.view ?? null });
    confidence = res;
  } catch (error) {
    log.info("investment-case", "confidence_failed", {
      ticker,
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }

  // 5) Data-depth flags voor dit asset.
  let historyPoints = 0;
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 200 * 86_400_000);
    const hist = await getHistory({
      ticker,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      interval: "1d",
    });
    historyPoints = hist.length;
  } catch {
    historyPoints = 0;
  }

  const hasFundamentals =
    fundamentals !== null &&
    (typeof fundamentals.pe === "number" ||
      typeof fundamentals.roic === "number" ||
      typeof fundamentals.pb === "number");
  const hasDividend =
    fundamentals !== null && typeof fundamentals.dividendYield === "number";
  const livePrice =
    valuation?.priceSource === "market" || holding?.currentPrice !== null;

  const dataDepth = computeAssetDataDepth({
    ticker,
    flags: {
      live_price: livePrice === true,
      fundamentals: hasFundamentals,
      dividend: hasDividend,
      macro: input.hasMacroRegime !== false,
      history: historyPoints >= HISTORY_MIN_POINTS,
    },
    sources: livePrice ? ["market"] : [],
  });

  // 6) Portfolio sector-HHI (uit risk).
  const portfolioSectorHhi = input.view?.risk.sectorConcentrationHhi ?? null;

  // 7) Asset-class fallback: van holding, anders van enrichment.
  const assetClass =
    holding?.assetClass ?? enrichment?.assetClass ?? "OTHER";

  return buildInvestmentCase({
    generatedAt,
    ticker,
    name: holding?.name ?? enrichment?.name ?? null,
    assetClass: assetClass as BuildInvestmentCaseAssetClass,
    classification: holding?.classification ?? null,
    sector: holding?.sector ?? enrichment?.sector ?? null,
    industry: enrichment?.industry ?? null,
    country: enrichment?.country ?? null,
    region: enrichment && enrichment.region !== "Unknown" ? enrichment.region : null,
    // Yahoo's longBusinessSummary wordt in v1 nog niet doorgegeven via
    // EnrichedInstrument; we laten dit veld voorlopig null. Engine
    // markeert de card dan correct als partial/missing.
    businessSummary: null,
    fundamentals,
    factorScore: holding?.factorScore ?? null,
    confidence,
    portfolioWeight: weight,
    portfolioSectorHhi,
    dataDepth,
  });
}

type BuildInvestmentCaseAssetClass =
  | "EQUITY"
  | "ETF"
  | "BOND"
  | "REIT"
  | "COMMODITY"
  | "CRYPTO"
  | "CASH"
  | "OTHER";
