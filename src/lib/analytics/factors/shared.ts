/**
 * Shared primitieven voor de factor scoring engine.
 *
 * Conventie: elke factor score is een getal in [0, 100]. 0 = ongunstig,
 * 100 = zeer gunstig, 50 = neutraal of onvoldoende data.
 *
 * Elke factor-module bouwt een set `FactorSignal`-objecten op uit beschikbare
 * inputs en combineert die via `scoreFromSignals`. Ontbrekende signalen
 * worden gewoon overgeslagen — zo zakt de score niet onterecht naar 0 bij
 * dun-gevulde data.
 */

export interface FactorSignal {
  /** Stabiele identifier voor UI/telemetry. */
  key: string;
  /** Leesbare naam van de metric. */
  label: string;
  /** Ruwe input-waarde (bv. 0.18 voor 18% ROIC). */
  value: number | null;
  /** Gewicht binnen de factor. */
  weight: number;
  /** Genormaliseerde bijdrage 0..100, of null als er geen data was. */
  score: number | null;
  /** Korte Nederlandstalige toelichting. */
  rationale?: string;
}

export const NEUTRAL_SCORE = 50;

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Lineaire ramp-up: waarden <= min krijgen 0, >= max krijgen 100.
 * Non-finite input → 0 (laag/niet gescoord).
 */
export function rampUp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (max === min) return value >= max ? 100 : 0;
  if (value <= min) return 0;
  if (value >= max) return 100;
  return ((value - min) / (max - min)) * 100;
}

/**
 * Lineaire ramp-down: waarden <= min krijgen 100, >= max krijgen 0.
 * Handig voor metrics waar hoger slechter is (bv. P/E, debt/equity).
 */
export function rampDown(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 100;
  if (max === min) return value <= min ? 100 : 0;
  if (value <= min) return 100;
  if (value >= max) return 0;
  return 100 - ((value - min) / (max - min)) * 100;
}

export type SignalKind = "rampUp" | "rampDown";

export interface SignalSpec {
  key: string;
  label: string;
  value: number | null | undefined;
  weight?: number;
  kind: SignalKind;
  min: number;
  max: number;
  /** Rationale-bouwer o.b.v. gescoord cijfer en ruwe waarde. */
  rationale: (score: number, value: number) => string;
}

/**
 * Bouwt een `FactorSignal` uit een spec. Missende of niet-finite values
 * resulteren in een signal met `score: null` zodat het overgeslagen wordt
 * bij aggregatie.
 */
export function buildSignal(spec: SignalSpec): FactorSignal {
  const weight = spec.weight ?? 1;
  if (
    spec.value === null ||
    spec.value === undefined ||
    !Number.isFinite(spec.value)
  ) {
    return {
      key: spec.key,
      label: spec.label,
      value: null,
      weight,
      score: null,
    };
  }

  const numeric = Number(spec.value);
  const raw =
    spec.kind === "rampUp"
      ? rampUp(numeric, spec.min, spec.max)
      : rampDown(numeric, spec.min, spec.max);
  // Rond af op gehele getallen zodat IEEE-754 ruis (bv. 75.00000000000001)
  // niet in downstream tiers (rationale-thresholds, UI-weergave) terechtkomt.
  // Consumenten werken consequent met int-scores 0..100.
  const score = Math.round(raw);

  return {
    key: spec.key,
    label: spec.label,
    value: numeric,
    weight,
    score,
    rationale: spec.rationale(score, numeric),
  };
}

export interface ScoreFromSignalsResult {
  score: number;
  rationales: string[];
  /** Aantal signalen dat daadwerkelijk bijgedragen heeft. */
  coverage: number;
}

/**
 * Combineer signalen tot een genormaliseerd 0..100 cijfer + rationales.
 *
 * Signalen met `score === null` worden genegeerd. Als er 0 bruikbare
 * signalen zijn, retourneert deze functie een neutrale 50 met een duidelijke
 * rationale. Rationales worden gesorteerd op afwijking van het neutrale midden
 * (extreme waardes eerst) zodat de top 3 de sterkste drivers tonen.
 */
export function scoreFromSignals(
  signals: FactorSignal[],
  options: { topRationales?: number } = {},
): ScoreFromSignalsResult {
  const active = signals.filter(
    (signal): signal is FactorSignal & { score: number } =>
      signal.score !== null && Number.isFinite(signal.score),
  );

  if (active.length === 0) {
    return {
      score: NEUTRAL_SCORE,
      rationales: ["Onvoldoende data — neutrale score toegepast."],
      coverage: 0,
    };
  }

  const totalWeight = active.reduce((sum, s) => sum + s.weight, 0);
  const raw =
    totalWeight === 0
      ? active.reduce((sum, s) => sum + s.score, 0) / active.length
      : active.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight;

  const topN = options.topRationales ?? 3;
  // Sorteer op *weighted* afstand tot neutraal — zo komen signalen met
  // hoog businessgewicht (bv. ROIC in quality) naar boven, ook als een
  // minder belangrijke metric iets extremer scoort.
  const rationales = active
    .slice()
    .sort(
      (a, b) =>
        b.weight * Math.abs(b.score - NEUTRAL_SCORE) -
        a.weight * Math.abs(a.score - NEUTRAL_SCORE),
    )
    .slice(0, topN)
    .map(
      (s) =>
        s.rationale ?? `${s.label}: ${s.score.toFixed(0)}/100`,
    );

  return {
    score: Math.round(clamp(raw, 0, 100)),
    rationales,
    coverage: active.length / signals.length,
  };
}

/** Formatteer een fractie als percentage, bv. 0.182 → "18,2%". */
export function formatPct(value: number, decimals = 1): string {
  return `${(value * 100).toLocaleString("nl-NL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

/** Formatteer een ratio op één decimaal, bv. 12.34 → "12,3". */
export function formatRatio(value: number, decimals = 1): string {
  return value.toLocaleString("nl-NL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
