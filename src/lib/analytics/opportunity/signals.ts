import type {
  OpportunitySignal,
  OpportunitySignalType,
} from "@/lib/analytics/opportunity-radar";

import type { OpportunityType } from "./types";

/**
 * Signal-mapping: vertaalt de 8 radar-signaaltypes naar de 5
 * publiek-aangeboden `OpportunityType`-waarden van deze module.
 *
 * Niet-publiek geëxposeerde radar-signalen (`watchlist-target`,
 * `defensive-bargain`, `earnings-sentiment-placeholder`) worden
 * **niet** gepubliceerd via deze adapter. Ze blijven beschikbaar via
 * `@/lib/analytics/opportunity-radar` voor de bestaande UI.
 */

const SIGNAL_TYPE_MAP: Partial<Record<OpportunitySignalType, OpportunityType>> =
  {
    "quality-pullback": "QUALITY_PULLBACK",
    "value-dislocation": "VALUE_MISPRICING",
    "momentum-reversal": "MOMENTUM_REVERSAL",
    "underweight-high-conviction": "UNDERWEIGHT_HIGH_CONVICTION",
    "etf-core-rebalance": "ETF_REBALANCE_OPPORTUNITY",
  };

/**
 * `null` voor signalen die we niet exposeren (bv. defensive-bargain).
 * Pure functie.
 */
export function mapSignalType(
  type: OpportunitySignalType,
): OpportunityType | null {
  return SIGNAL_TYPE_MAP[type] ?? null;
}

/**
 * Filter een signal-lijst op de 5 ondersteunde types. Behoudt input-
 * volgorde.
 */
export function filterPublicSignals(
  signals: OpportunitySignal[],
): OpportunitySignal[] {
  return signals.filter((s) => SIGNAL_TYPE_MAP[s.type] !== undefined);
}

/**
 * Kies het sterkste publiek signaal uit een lijst — gebruikt om één
 * `opportunityType` per kandidaat te bepalen. Tie-break op alfabet
 * van signal-type-string voor determinisme.
 */
export function pickPrimarySignal(
  signals: OpportunitySignal[],
): OpportunitySignal | null {
  const publicSignals = filterPublicSignals(signals);
  if (publicSignals.length === 0) return null;
  return publicSignals.reduce((best, candidate) => {
    if (candidate.strength > best.strength) return candidate;
    if (
      candidate.strength === best.strength &&
      candidate.type < best.type
    ) {
      return candidate;
    }
    return best;
  });
}

export { SIGNAL_TYPE_MAP };
