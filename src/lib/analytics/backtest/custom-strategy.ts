import { computeMomentum12m, type StrategyFn } from "./strategies";

/**
 * Custom-strategy factory voor Strategy Lab. Zet een UI-configuratie om
 * naar een `StrategyFn` die de backtest engine kan aanroepen.
 *
 * Ontwerpregels:
 *  - Factor weights zijn absolute getallen (0..1 of hoger). De factory
 *    normaliseert ze niet; als de som 0 is valt de score terug op 50 per
 *    sub-score zodat alle selections equal-weight blijven.
 *  - Momentum signaal is dynamisch (12-m prijs) wanneer `useMomentum: true`;
 *    anders wordt de statische factorScore.subScores.momentum gebruikt.
 *  - Sector cap wordt greedy afgedwongen: scan geranged universum en sla
 *    een member over als zijn sector al op cap zit.
 *  - Defensive overlay schaalt alle position-weights met 0.8 zodat 20%
 *    cash aangehouden wordt — net als de ingebouwde regime-aware strategie.
 */

export interface CustomStrategyWeights {
  quality: number;
  value: number;
  momentum: number;
  lowVol: number;
}

export interface CustomStrategyConfig {
  factorWeights: CustomStrategyWeights;
  /** Filter uit candidates zonder dividend-signaal. */
  requireDividend?: boolean;
  /** Tilt naar quality+lowVol en reserveer 20% cash. */
  defensiveOverlay?: boolean;
  /** Gebruik dynamisch 12m-prijsmomentum i.p.v. factorScore.subScores.momentum. */
  useMomentum?: boolean;
  /** Max aantal posities. */
  maxPositions?: number;
  /** Harde cap per positie (0..1). */
  maxPositionWeight?: number;
  /** Harde cap per sector (0..1). */
  maxSectorWeight?: number;
}

export function buildCustomStrategy(
  config: CustomStrategyConfig,
): StrategyFn {
  return (ctx) => {
    const maxPositions =
      config.maxPositions ?? ctx.config.maxPositions ?? 10;
    const maxPositionWeight =
      config.maxPositionWeight ?? ctx.config.maxPositionWeight ?? 1;
    const maxSectorWeight = config.maxSectorWeight ?? 1;

    const pool = config.requireDividend
      ? ctx.members.filter((m) => hasDividendSignal(m.factorScore))
      : ctx.members;

    const ranked = pool
      .map((m) => ({ m, score: scoreMember(m, config, ctx) }))
      .filter(
        (entry): entry is { m: typeof entry.m; score: number } =>
          entry.score !== null && Number.isFinite(entry.score),
      )
      .sort((a, b) => b.score - a.score);

    // Apply defensive overlay: 20% cash reservation.
    const overlayScale = config.defensiveOverlay ? 0.8 : 1;
    const basePosWeight = Math.min(
      maxPositionWeight,
      overlayScale / maxPositions,
    );

    const sectorWeights = new Map<string, number>();
    const selected: Array<{ ticker: string; weight: number }> = [];

    for (const { m } of ranked) {
      if (selected.length >= maxPositions) break;
      const sectorKey = m.sector ?? "Unknown";
      const sectorNow = sectorWeights.get(sectorKey) ?? 0;
      if (sectorNow + basePosWeight > maxSectorWeight) continue;
      selected.push({ ticker: m.ticker, weight: basePosWeight });
      sectorWeights.set(sectorKey, sectorNow + basePosWeight);
    }

    if (selected.length === 0) {
      return {
        weights: new Map(),
        rationale: "Geen candidates voldoen aan de filters.",
      };
    }

    // Als de selectie kleiner is dan `maxPositions`, her-distribueer
    // binnen sector- en positie-caps zodat total weight = overlayScale.
    const sumNow = selected.reduce((s, x) => s + x.weight, 0);
    const target = overlayScale;
    if (sumNow > 0 && Math.abs(sumNow - target) > 0.001) {
      const scale = target / sumNow;
      const weights = new Map<string, number>();
      const rescaledSector = new Map<string, number>();
      for (const entry of selected) {
        let candidate = entry.weight * scale;
        candidate = Math.min(candidate, maxPositionWeight);
        const sectorKey =
          pool.find((m) => m.ticker === entry.ticker)?.sector ?? "Unknown";
        const sectorSoFar = rescaledSector.get(sectorKey) ?? 0;
        candidate = Math.min(candidate, maxSectorWeight - sectorSoFar);
        if (candidate <= 0.001) continue;
        rescaledSector.set(sectorKey, sectorSoFar + candidate);
        weights.set(entry.ticker, candidate);
      }
      return {
        weights,
        rationale: buildRationale(config, weights.size),
      };
    }

    const weights = new Map(selected.map((s) => [s.ticker, s.weight]));
    return {
      weights,
      rationale: buildRationale(config, weights.size),
    };
  };
}

// ============================================================
//  Scoring
// ============================================================

function scoreMember(
  m: import("./strategies").UniverseMember,
  config: CustomStrategyConfig,
  ctx: import("./strategies").StrategyContext,
): number | null {
  const sub = m.factorScore?.subScores;
  if (!sub) return null;

  const weights = config.factorWeights;
  const totalWeight =
    weights.quality + weights.value + weights.momentum + weights.lowVol;
  if (totalWeight <= 0) {
    // Degenereert naar equal-weight — elke member krijgt neutrale 50.
    return 50;
  }

  let sum = 0;
  sum += (sub.quality ?? 50) * weights.quality;
  sum += (sub.value ?? 50) * weights.value;
  sum += (sub.lowVol ?? 50) * weights.lowVol;

  const momentumSignal = config.useMomentum
    ? dynamicMomentumScore(m.ticker, ctx)
    : (sub.momentum ?? 50);
  sum += momentumSignal * weights.momentum;

  return sum / totalWeight;
}

function dynamicMomentumScore(
  ticker: string,
  ctx: import("./strategies").StrategyContext,
): number {
  const return12m = computeMomentum12m(
    ticker,
    ctx.asOf,
    ctx.priceHistoryByTicker,
  );
  if (return12m === null) return 50;
  // Map -0.2..+0.5 naar 0..100 (lineair, clamped).
  return Math.max(0, Math.min(100, (return12m + 0.2) * 143));
}

function hasDividendSignal(
  factorScore: import("@/types/factor").FactorScore | null | undefined,
): boolean {
  if (!factorScore) return false;
  if ((factorScore.subScores.dividend ?? 0) >= 50) return true;
  const valueRationale = factorScore.rationales?.value ?? [];
  return valueRationale.some((r) => /dividend/i.test(r));
}

function buildRationale(
  config: CustomStrategyConfig,
  selectedCount: number,
): string {
  const parts: string[] = [];
  const w = config.factorWeights;
  parts.push(
    `Gewichten Q${format(w.quality)} / V${format(w.value)} / M${format(w.momentum)} / R${format(w.lowVol)}`,
  );
  if (config.useMomentum) parts.push("dynamisch momentum");
  if (config.defensiveOverlay) parts.push("defensieve overlay (20% cash)");
  if (config.requireDividend) parts.push("dividend vereist");
  parts.push(`${selectedCount} posities`);
  return parts.join(" · ");
}

function format(value: number): string {
  return value.toFixed(2);
}
