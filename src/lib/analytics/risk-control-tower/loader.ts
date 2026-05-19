/**
 * Risk Control Tower — server-side loader (Module 29).
 *
 * Verzamelt alle inputs uit bestaande engines en delegeert aan de pure
 * `buildRiskControlTowerReport`-engine. Faal-safe: per-bron try/catch
 * → ontbrekende velden leiden tot `severity: "gray"` in die categorie,
 * niet tot een crash.
 *
 * **Hergebruikt**:
 *  - buildPortfolioView (risk + summary + health)
 *  - loadBehavioralCoach (behavioral signals)
 *  - fetchRegimeInputs + computeRegimeScore (rates + curve + regime)
 *  - buildPortfolioDepth (M26 data-depth score)
 */

import { buildPortfolioDepth } from "@/lib/analytics/data-depth/loader";
import { loadBehavioralCoach } from "@/lib/analytics/behavioral/loader";
import type { PortfolioView } from "@/lib/analytics/portfolio-view";
import { computeRegimeScore } from "@/lib/analytics/regime/engine";
import { fetchRegimeInputs } from "@/lib/data/regime";
import { getFundamentals } from "@/lib/data/fundamentals";
import { log } from "@/lib/log";

import { buildRiskControlTowerReport } from "./engine";
import type { RiskControlTowerReport } from "./types";

export interface LoadRiskControlTowerInput {
  /** Reeds geresolveerde portfolio-view (uit caller — saves re-fetch). */
  view: PortfolioView;
  /** User-email voor behavioral-coach lookup. Optioneel. */
  userEmail?: string;
}

export async function loadRiskControlTowerReport(
  input: LoadRiskControlTowerInput,
): Promise<RiskControlTowerReport> {
  const view = input.view;
  const generatedAt = new Date().toISOString();

  // --- Macro / regime ---
  let regimeAlignment: number | null = view.health.regimeAlignmentScore ?? null;
  let regimeStance: "RISK_ON" | "NEUTRAL" | "DEFENSIVE" | null = null;
  let interestRate10y: number | null = null;
  let rateChange1y: number | null = null;
  let yieldCurveSlope: number | null = null;

  try {
    const fetched = await fetchRegimeInputs();
    if (fetched) {
      interestRate10y = fetched.input.interestRate10y ?? null;
      rateChange1y = fetched.input.rateChange1y ?? null;
      yieldCurveSlope = fetched.input.yieldCurveSlope ?? null;
      const regime = computeRegimeScore(fetched.input, {
        source: fetched.source,
      });
      regimeStance = regime.stance;
    }
  } catch (error) {
    log.info("risk-control-tower", "regime_fetch_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }

  // --- Behavioral ---
  let behavioralActiveCount: number | null = null;
  let behavioralHighCount: number | null = null;
  if (input.userEmail) {
    try {
      const beh = await loadBehavioralCoach({ userEmail: input.userEmail });
      const active = beh.partitioned.active ?? [];
      behavioralActiveCount = active.length;
      behavioralHighCount = active.filter(
        (s) => s.severity === "high" || s.severity === "elevated",
      ).length;
    } catch (error) {
      log.info("risk-control-tower", "behavioral_fetch_failed", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  // --- Crypto / speculation ---
  const totalValue = view.summary.totalValue;
  let cryptoWeight = 0;
  let speculativeWeight = 0;
  for (const v of view.valuations) {
    if (v.holding.assetClass === "CRYPTO") {
      cryptoWeight += v.marketValueBase;
    }
    const isSpec = v.holding.classification?.isSpeculative ?? false;
    if (isSpec) {
      speculativeWeight += v.marketValueBase;
    }
  }
  const cryptoW =
    totalValue > 0 ? cryptoWeight / totalValue : 0;
  const specW =
    totalValue > 0 ? speculativeWeight / totalValue : 0;

  // --- Illiquid weight ---
  let illiquidWeight: number | null = null;
  try {
    let illiquid = 0;
    let counted = 0;
    for (const v of view.valuations) {
      const liq = v.holding.riskAnalysis?.liquidityScore;
      if (typeof liq === "number") {
        counted += 1;
        if (liq < 0.5) illiquid += v.marketValueBase;
      }
    }
    // Alleen meting publiceren als ≥ 50% van portfolio een liquidity-score heeft.
    if (counted > 0 && totalValue > 0) {
      const covered =
        view.valuations
          .filter((v) => typeof v.holding.riskAnalysis?.liquidityScore === "number")
          .reduce((sum, v) => sum + v.marketValueBase, 0) / totalValue;
      if (covered >= 0.5) {
        illiquidWeight = illiquid / totalValue;
      }
    }
  } catch {
    illiquidWeight = null;
  }

  // --- Data quality (M26) ---
  let dataDepthScore: number | null = null;
  try {
    // Bouw fundamentals-map voor data-depth-loader.
    const fundamentalsByTicker = new Map(
      await Promise.all(
        view.valuations.map(async (v) => {
          try {
            return [
              v.holding.ticker,
              await getFundamentals(v.holding.ticker),
            ] as const;
          } catch {
            return [v.holding.ticker, null] as const;
          }
        }),
      ),
    );
    const depth = buildPortfolioDepth({
      view,
      fundamentalsByTicker,
      hasMacroRegime: true,
    });
    dataDepthScore = depth.portfolio.weightedScore;
  } catch (error) {
    log.info("risk-control-tower", "data_depth_failed", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }

  return buildRiskControlTowerReport({
    generatedAt,

    largestPositionWeight: view.risk.largestPositionWeight,
    largestPositionTicker: view.summary.largestPosition?.ticker ?? null,
    top5Weight: view.risk.top5Weight ?? null,
    concentrationHhi: view.risk.concentrationHhi,
    positionCount: view.summary.positionCount,

    topSector: view.risk.topSector ?? null,
    sectorConcentrationHhi: view.risk.sectorConcentrationHhi,

    topRegion: deriveTopRegion(view),
    regionConcentrationHhi: view.risk.regionConcentrationHhi,

    foreignCurrencyExposure: view.risk.foreignCurrencyExposure ?? null,

    interestRate10y,
    rateChange1y,
    yieldCurveSlope,
    regimeAlignmentScore: regimeAlignment,
    regimeStance,

    maxDrawdown: view.risk.maxDrawdown ?? null,
    valueAtRisk95: view.risk.valueAtRisk95 ?? null,
    portfolioVolatility: view.risk.portfolioVolatility ?? null,

    illiquidWeight,

    dataDepthScore,

    cryptoWeight: cryptoW,
    speculativeWeight: specW,

    behavioralActiveCount,
    behavioralHighCount,
  });
}

function deriveTopRegion(view: PortfolioView): {
  label: string;
  weight: number;
} | null {
  const slices = view.risk.exposures.byRegion ?? [];
  if (slices.length === 0) return null;
  const top = [...slices].sort((a, b) => b.weight - a.weight)[0];
  if (!top) return null;
  return { label: top.label, weight: top.weight };
}
