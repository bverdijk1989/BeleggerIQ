/**
 * Redeploy-budget calculator.
 *
 * Pure functie: gegeven proceeds van een SELL + huidig regime + lijst
 * van toegestane BUY-kandidaten → bereken hoeveel cash terug in de markt
 * gaat én naar welke ticker.
 *
 * **Beleidsfilosofie** (Druckenmiller / Marks / Buffett-laag):
 *   - **80% default** — time-in-the-market verslaat market-timing.
 *   - **DEFENSIVE regime: 60%** — ervaren growth-investors schalen
 *     deployment-tempo terug bij ongunstige breadth, niet hun mandaat.
 *     De extra 20% is droog kruit voor latere koopjes wanneer de
 *     regime-engine weer omschakelt naar NEUTRAL.
 *   - Geen profile-specifieke aftrek (CAPITAL_PRESERVATION e.d.) —
 *     dat hoort in `objective`/`riskTolerance`-laag, niet hier. Deze
 *     module gaat alleen over **regime-aware re-deployment**.
 */

import type { AllocationPlan } from "@/types/allocation";

export type RegimeStanceTier = "RISK_ON" | "NEUTRAL" | "DEFENSIVE";

export interface RedeployInput {
  /** Bruto cash uit de SELL (qty × prijs), in base-currency. */
  proceeds: number;
  /** Markt-regime stance — bepaalt deployment-tempo. */
  stance: RegimeStanceTier | null;
  /** Toegestane kandidaten — typisch `allocationPlan.recommendations`. */
  allocationPlan: AllocationPlan | null;
  /** Symbool van de positie die net is verkocht — uitsluiten als BUY-target. */
  excludeSymbol?: string | null;
}

export interface RedeployTarget {
  ticker: string;
  name: string | null;
  /** Bedrag in base-currency. */
  amount: number;
  /** Engine-rationale uit allocation-plan. */
  rationale: string | null;
}

export interface RedeployResult {
  /** Fractie van proceeds dat we hergebruiken (0..1). */
  redeployFraction: number;
  /** Geld dat naar de markt teruggaat. */
  redeployAmount: number;
  /** Cash-buffer dat bewust achterblijft (proceeds - redeployAmount). */
  reservedCash: number;
  /** Voorgestelde target. `null` wanneer geen geldige kandidaat. */
  target: RedeployTarget | null;
  /** Korte uitleg waarom deze keuze (regime + target-rationale). */
  reasoning: string;
}

const REDEPLOY_FRACTION_DEFAULT = 0.8;
const REDEPLOY_FRACTION_DEFENSIVE = 0.6;

function fractionForStance(stance: RegimeStanceTier | null): number {
  switch (stance) {
    case "DEFENSIVE":
      return REDEPLOY_FRACTION_DEFENSIVE;
    case "RISK_ON":
    case "NEUTRAL":
    case null:
    default:
      return REDEPLOY_FRACTION_DEFAULT;
  }
}

function stanceLabel(stance: RegimeStanceTier | null): string {
  switch (stance) {
    case "RISK_ON":
      return "risk-on";
    case "DEFENSIVE":
      return "defensief";
    case "NEUTRAL":
    case null:
    default:
      return "neutraal";
  }
}

/**
 * Pak de eerste ALLOCATION-plan kandidaat die geldig is voor redeploy.
 * Geldig = `action ∈ {buy, add}`, een ticker, niet de zojuist verkochte
 * positie zelf, en bij voorkeur met een positief `suggestedAmount`.
 */
function pickTarget(
  allocationPlan: AllocationPlan | null,
  excludeSymbol: string | null | undefined,
): RedeployTarget | null {
  if (!allocationPlan) return null;
  for (const rec of allocationPlan.recommendations) {
    if (rec.action !== "buy" && rec.action !== "add") continue;
    if (!rec.ticker) continue;
    if (excludeSymbol && rec.ticker === excludeSymbol) continue;
    return {
      ticker: rec.ticker,
      name: rec.name ?? null,
      // Het uiteindelijke bedrag wordt door `computeRedeploy` gezet
      // (op basis van proceeds × fraction); we vullen 'em hier alvast
      // met de allocation-suggestie als plaatshouder.
      amount: rec.suggestedAmount,
      rationale:
        rec.rationale && rec.rationale.length > 0
          ? rec.rationale[0] ?? null
          : null,
    };
  }
  return null;
}

export function computeRedeploy(input: RedeployInput): RedeployResult {
  const fraction = fractionForStance(input.stance);
  const proceeds = Math.max(0, input.proceeds);
  const redeployAmount = Math.round(proceeds * fraction);
  const reservedCash = Math.max(0, proceeds - redeployAmount);

  const candidate = pickTarget(input.allocationPlan, input.excludeSymbol);

  // Als er geen kandidaat is → geen target, alle proceeds blijven cash.
  if (!candidate) {
    return {
      redeployFraction: fraction,
      redeployAmount: 0,
      reservedCash: proceeds,
      target: null,
      reasoning: `Geen kandidaat in het allocation-plan om in te herinvesteren — proceeds (${formatEur(proceeds)}) blijven voorlopig cash.`,
    };
  }

  // Override target.amount met het regime-budget i.p.v. de standaard
  // allocation-suggestie — de redeploy-grootte komt uit de SELL, niet
  // uit het maandelijkse contributie-budget.
  const target: RedeployTarget = {
    ...candidate,
    amount: redeployAmount,
  };

  const tier = stanceLabel(input.stance);
  const reasoning =
    fraction >= REDEPLOY_FRACTION_DEFAULT
      ? `Markt-regime ${tier}: herinvesteer ${Math.round(fraction * 100)}% van de proceeds direct (${formatEur(redeployAmount)}). Cash-buffer: ${formatEur(reservedCash)} voor fees/spread.`
      : `Markt-regime ${tier}: bewuste tilt naar ${Math.round(fraction * 100)}% herinvestering (${formatEur(redeployAmount)}); ${formatEur(reservedCash)} blijft droog kruit voor zwakkere markten.`;

  return {
    redeployFraction: fraction,
    redeployAmount,
    reservedCash,
    target,
    reasoning,
  };
}

function formatEur(amount: number): string {
  return `€${Math.round(amount).toLocaleString("nl-NL")}`;
}

// Test-only export voor exact threshold-snapshot.
export const REDEPLOY_THRESHOLDS = {
  default: REDEPLOY_FRACTION_DEFAULT,
  defensive: REDEPLOY_FRACTION_DEFENSIVE,
} as const;
