import type { DefensivenessLevel } from "@/types/screener";

/**
 * URL-parameter parsing + derivation voor /maandbeslissing.
 *
 * Parameters:
 *   - `budget` : numeriek, override op de profiel-contribution
 *   - `bias`   : "offensive" | "balanced" | "defensive"
 *   - `coreEtf`: "0" (uit) of afwezig/iets anders (aan, default)
 */

export interface MaandbeslissingConfig {
  budget?: number;
  bias: DefensivenessLevel;
  coreEtfEnabled: boolean;
}

type SearchParamsLike =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function readString(
  params: SearchParamsLike,
  key: string,
): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  if (Array.isArray(v)) return v[0];
  return v;
}

export function parseMaandbeslissingParams(
  params: SearchParamsLike,
): MaandbeslissingConfig {
  const budgetRaw = readString(params, "budget");
  const budgetNum =
    budgetRaw !== undefined && budgetRaw !== ""
      ? Number(budgetRaw.replace(",", "."))
      : undefined;
  const budget =
    budgetNum !== undefined && Number.isFinite(budgetNum) && budgetNum > 0
      ? Math.round(budgetNum)
      : undefined;

  const biasRaw = readString(params, "bias");
  const bias = isBias(biasRaw) ? biasRaw : "balanced";

  const coreEtfRaw = readString(params, "coreEtf");
  const coreEtfEnabled = coreEtfRaw !== "0";

  return { budget, bias, coreEtfEnabled };
}

export function maandbeslissingConfigToSearchParams(
  config: MaandbeslissingConfig,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (config.budget !== undefined && config.budget > 0)
    sp.set("budget", String(config.budget));
  if (config.bias !== "balanced") sp.set("bias", config.bias);
  if (!config.coreEtfEnabled) sp.set("coreEtf", "0");
  return sp;
}

/**
 * Vertaalt een defensiveness-bias naar een multiplier op het basisbudget.
 * - offensive : 1.0 — volle inzet
 * - balanced  : 1.0 — standaard
 * - defensive : 0.85 — 15% minder deployen naast de regime-adjustments
 */
export function biasBudgetMultiplier(bias: DefensivenessLevel): number {
  switch (bias) {
    case "offensive":
      return 1.0;
    case "defensive":
      return 0.85;
    case "balanced":
    default:
      return 1.0;
  }
}

export const DEFAULT_MONTHLY_BUDGET = 500;

// ============================================================
//  Internals
// ============================================================

function isBias(value: unknown): value is DefensivenessLevel {
  return value === "offensive" || value === "balanced" || value === "defensive";
}
