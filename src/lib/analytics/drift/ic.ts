/**
 * Information Coefficient (IC) berekening voor factor-drift-monitoring.
 *
 * **Wat is IC?**
 * Spearman rank-correlatie tussen factor-rank (op moment T) en realized-
 * return-rank (op moment T + window). Range [-1, 1]:
 *  - IC > 0.05 — factor heeft een echt signaal (Asness-norm)
 *  - IC ≈ 0    — factor is random
 *  - IC < 0    — factor werkt **omgekeerd**, mogelijk crowded-out
 *
 * **Waarom Spearman, niet Pearson?**
 * Spearman gebruikt ranks i.p.v. ruwe waardes — robuust tegen outliers
 * (bv. één extreme winnaar trekt Pearson scheef). Standaard in
 * factor-research-literatuur.
 *
 * Pure functie. Geen DB, geen netwerk. Caller koppelt factor-scores aan
 * realized-returns (bv. uit `PortfolioSnapshot`-historie of een
 * benchmark-index).
 */

export interface FactorReturnPair {
  /** Score van de factor op moment T (bv. quality 65/100). */
  factorScore: number;
  /** Realized return over het window vanaf T (fractie, bv. 0.045 = +4.5%). */
  realizedReturn: number;
}

export interface IcResult {
  /** Spearman rank-correlatie [-1, 1]. */
  ic: number;
  /** Fractie posities waar de directional voorspelling klopte (rank ≥ mediaan ↔ return ≥ mediaan). */
  hitRate: number;
  /** Aantal datapoints dat is meegenomen. */
  sampleSize: number;
}

const MIN_SAMPLE_SIZE = 5;

/**
 * Bereken Spearman-IC + hit-rate over een set (factor, return)-paren.
 * Sample-size onder de drempel → return null (signaal te dun).
 */
export function computeFactorIc(
  pairs: FactorReturnPair[],
): IcResult | null {
  // Drop niet-finite waardes; ze duiden op ontbrekende data, niet
  // op slecht-presterende factor.
  const clean = pairs.filter(
    (p) =>
      Number.isFinite(p.factorScore) && Number.isFinite(p.realizedReturn),
  );
  if (clean.length < MIN_SAMPLE_SIZE) return null;

  const factorRanks = rank(clean.map((p) => p.factorScore));
  const returnRanks = rank(clean.map((p) => p.realizedReturn));
  const ic = pearsonCorrelation(factorRanks, returnRanks);

  // Hit-rate: voor elk paar, klopt onze rank-richting met de
  // return-rank-richting? Mediane factor-rank ≥ → mediane return-rank ≥.
  const medianFactorRank = median(factorRanks);
  const medianReturnRank = median(returnRanks);
  let hits = 0;
  for (let i = 0; i < clean.length; i++) {
    const aboveFactor = (factorRanks[i] ?? 0) >= medianFactorRank;
    const aboveReturn = (returnRanks[i] ?? 0) >= medianReturnRank;
    if (aboveFactor === aboveReturn) hits += 1;
  }
  const hitRate = hits / clean.length;

  return {
    ic: Number.isFinite(ic) ? ic : 0,
    hitRate,
    sampleSize: clean.length,
  };
}

/**
 * Tied-rank ('average rank' bij ties) — standaard methode voor Spearman
 * zodat ties geen artificial correlation introduceren.
 */
function rank(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1]!.v === indexed[i]!.v) {
      j++;
    }
    // Average rank voor [i..j].
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      ranks[indexed[k]!.i] = avg;
    }
    i = j + 1;
  }
  return ranks;
}

function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < n; i++) {
    const dx = (x[i] ?? 0) - meanX;
    const dy = (y[i] ?? 0) - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }
  if (denomX === 0 || denomY === 0) return 0;
  return num / Math.sqrt(denomX * denomY);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : sorted[mid] ?? 0;
}

/**
 * Drempels voor narrative-tekst — gebaseerd op consensus in factor-
 * research-literatuur (Asness, Frazzini, Pedersen).
 */
export const IC_THRESHOLDS = {
  /** Onder deze drempel: factor lijkt niet meer voorspellend. */
  driftWarning: 0.03,
  /** Boven deze drempel: factor presteert sterk. */
  strongSignal: 0.10,
  /** Hit-rate onder deze drempel: directionally vrijwel random. */
  hitRateWarning: 0.52,
} as const;

/**
 * Bouw een NL-narrative voor de UI op basis van IC + hit-rate.
 */
export function buildDriftNarrative(input: {
  factor: string;
  window: string;
  ic: number;
  hitRate: number;
}): string {
  const factorLabel = input.factor;
  const windowLabel = input.window;
  if (input.ic >= IC_THRESHOLDS.strongSignal) {
    return `${factorLabel} (${windowLabel}): IC ${input.ic.toFixed(2)} — sterk signaal, factor werkt op je universum.`;
  }
  if (input.ic <= -IC_THRESHOLDS.strongSignal) {
    return `${factorLabel} (${windowLabel}): IC ${input.ic.toFixed(2)} — factor werkt omgekeerd; overweeg uitsluiting tot regime-shift.`;
  }
  if (Math.abs(input.ic) < IC_THRESHOLDS.driftWarning) {
    return `${factorLabel} (${windowLabel}): IC ${input.ic.toFixed(2)} — factor lijkt niet meer voorspellend op je universum (drift).`;
  }
  return `${factorLabel} (${windowLabel}): IC ${input.ic.toFixed(2)} — gemengd signaal.`;
}
