/**
 * Portfolio Health Score — engine orchestrator.
 *
 * Wires de 10 component-scorers in een gewogen totaalscore (0..100) +
 * letter-grade + top-3 verbeteradviezen. Zuivere functie: input →
 * deterministische output.
 *
 * **Renormalisatie bij no_data**: wanneer een component geen data heeft
 * (status = "no_data") wordt zijn weight uit de noemer gehaald én levert
 * hij geen contribution. Resultaat: een portefeuille zonder dividend-data
 * wordt niet gestraft — de andere 9 components dragen 100% van de score.
 *
 * **Confidence-as-coverage**: totaal-confidence is gewogen gemiddelde
 * van per-component confidence. Een score van 75 met confidence 0.4 is
 * een waarschuwing dat de meting wankel is — de UI kan dit visueel tonen.
 */

import type { PortfolioHealthInput } from "./loader-types";
import {
  scoreCashBuffer,
  scoreDiversification,
  scoreDividendQuality,
  scoreFundamentalQuality,
  scoreGeographicConcentration,
  scoreMacroSensitivity,
  scoreMaxDrawdown,
  scoreSectorConcentration,
  scoreValuationRisk,
  scoreVolatility,
} from "./scorers";
import type {
  HealthComponent,
  HealthComponentKey,
  HealthGrade,
  HealthRecommendation,
  PortfolioHealthScore,
} from "./types";
import { DEFAULT_HEALTH_WEIGHTS } from "./types";

const TOP_RECOMMENDATIONS_LIMIT = 3;

function gradeFromScore(score: number): HealthGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

/**
 * Bouw een korte, scanbare headline. We pakken de zwakste actieve
 * component (laagste score) als focuspunt + de sterkste als anchor —
 * zodat de gebruiker binnen 1 zin weet wat goed gaat én wat aandacht
 * vereist.
 */
function buildHeadline(components: HealthComponent[], totalScore: number): string {
  const active = components.filter((c) => c.status !== "no_data");
  if (active.length === 0) {
    return "Te weinig data voor een betrouwbare score.";
  }
  const sorted = [...active].sort((a, b) => a.score - b.score);
  const weakest = sorted[0]!;
  const strongest = sorted[sorted.length - 1]!;

  // Wanneer alles ok+ is: enkel anchor.
  if (totalScore >= 80) {
    return `Solide totaalscore — ${strongest.label.toLowerCase()} draagt sterk bij.`;
  }
  if (totalScore < 40) {
    return `Score onder de maat — kritiek aandachtspunt: ${weakest.label.toLowerCase()}.`;
  }
  // Mid-range: noem zwakste + sterkste.
  if (weakest.score >= 60) {
    return `Gezonde balans — ${strongest.label.toLowerCase()} sterkst, ${weakest.label.toLowerCase()} kan beter.`;
  }
  return `${strongest.label} is in orde, maar ${weakest.label.toLowerCase()} vraagt aandacht.`;
}

/**
 * Pak de top-N recommendations gesorteerd op `expectedImpact` desc.
 * Dedup op title (als twee components hetzelfde voorstel doen, één keer).
 */
function pickTopRecommendations(components: HealthComponent[]): HealthRecommendation[] {
  const all: HealthRecommendation[] = [];
  for (const c of components) {
    for (const rec of c.recommendations) {
      all.push(rec);
    }
  }
  // Sort desc op impact, dedupe by title.
  const seen = new Set<string>();
  const sorted = [...all].sort(
    (a, b) => (b.expectedImpact ?? 0) - (a.expectedImpact ?? 0),
  );
  const dedup: HealthRecommendation[] = [];
  for (const rec of sorted) {
    if (seen.has(rec.title)) continue;
    seen.add(rec.title);
    dedup.push(rec);
    if (dedup.length >= TOP_RECOMMENDATIONS_LIMIT) break;
  }
  return dedup;
}

/**
 * Computeer de gewogen totaalscore. No_data components worden uit de
 * noemer gehaald en hun weight herverdeeld over de rest.
 */
function computeWeightedTotal(components: HealthComponent[]): {
  total: number;
  effectiveWeight: number;
  totalConfidence: number;
} {
  const active = components.filter((c) => c.status !== "no_data");
  if (active.length === 0) {
    return { total: 50, effectiveWeight: 0, totalConfidence: 0 };
  }
  const sumActiveWeight = active.reduce((sum, c) => sum + c.weight, 0);
  if (sumActiveWeight === 0) {
    return { total: 50, effectiveWeight: 0, totalConfidence: 0 };
  }

  let weightedSum = 0;
  let weightedConfSum = 0;
  for (const c of active) {
    const renormalizedWeight = c.weight / sumActiveWeight;
    weightedSum += c.score * renormalizedWeight;
    weightedConfSum += c.confidence * renormalizedWeight;
  }

  return {
    total: Math.round(weightedSum),
    effectiveWeight: sumActiveWeight,
    totalConfidence: Math.round(weightedConfSum * 100) / 100,
  };
}

/**
 * Run alle 10 scorers in vaste volgorde. Vaste output-volgorde (matchend
 * aan `DEFAULT_HEALTH_WEIGHTS`) maakt UI-rendering en snapshot-tests
 * deterministisch.
 */
function runAllScorers(
  input: PortfolioHealthInput,
  weights: Record<HealthComponentKey, number>,
): HealthComponent[] {
  return [
    scoreDiversification(input.diversification, weights.diversification),
    scoreSectorConcentration(input.sector, weights.sector_concentration),
    scoreGeographicConcentration(input.geographic, weights.geographic_concentration),
    scoreVolatility(input.volatility, weights.volatility),
    scoreMaxDrawdown(input.drawdown, weights.max_drawdown),
    scoreCashBuffer(input.cashBuffer, weights.cash_buffer),
    scoreDividendQuality(input.dividend, weights.dividend_quality),
    scoreFundamentalQuality(input.fundamental, weights.fundamental_quality),
    scoreValuationRisk(input.valuation, weights.valuation_risk),
    scoreMacroSensitivity(input.macro, weights.macro_sensitivity),
  ];
}

/**
 * Hoofd-API: bereken de Portfolio Health Score.
 *
 * @param input  Ge-aggregeerde input uit `loader.ts`.
 * @param weights  Optioneel — alleen overschrijven voor tests / experimenten.
 */
export function computePortfolioHealthScore(
  input: PortfolioHealthInput,
  weights: Record<HealthComponentKey, number> = DEFAULT_HEALTH_WEIGHTS,
): PortfolioHealthScore {
  const components = runAllScorers(input, weights);
  const { total, effectiveWeight, totalConfidence } = computeWeightedTotal(components);
  const grade = gradeFromScore(total);
  const headline = buildHeadline(components, total);
  const topRecommendations = pickTopRecommendations(components);

  return {
    portfolioId: input.portfolioId,
    asOf: input.asOf,
    totalScore: total,
    grade,
    confidence: totalConfidence,
    headline,
    topRecommendations,
    components,
    effectiveWeight,
  };
}
