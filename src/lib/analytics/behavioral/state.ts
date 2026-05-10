/**
 * State-merge: combineer pure signals met user-state (dismiss / snooze).
 *
 * Logica:
 *  - Geen state-record → ACTIVE.
 *  - Status=DISMISSED → blijft DISMISSED.
 *  - Status=SNOOZED met `snoozedUntil >= now` → SNOOZED.
 *  - Status=SNOOZED met `snoozedUntil < now` → ACTIVE (snooze expired).
 *
 * **Pure functie** zodat we 'em kunnen testen zonder DB. Loader regelt
 * de DB-fetch.
 */

import type {
  BehavioralSignal,
  BehavioralSignalWithState,
  BehavioralStatus,
  BehavioralWarningState,
} from "./types";

export function applyWarningStates(
  signals: ReadonlyArray<BehavioralSignal>,
  states: ReadonlyArray<BehavioralWarningState>,
  now: Date,
): BehavioralSignalWithState[] {
  const stateBySignalId = new Map<string, BehavioralWarningState>();
  for (const st of states) stateBySignalId.set(st.signalId, st);

  return signals.map((signal) => {
    const state = stateBySignalId.get(signal.id) ?? null;
    const effectiveStatus = deriveEffectiveStatus(state, now);
    return { ...signal, state, effectiveStatus };
  });
}

export function deriveEffectiveStatus(
  state: BehavioralWarningState | null,
  now: Date,
): BehavioralStatus {
  if (!state) return "ACTIVE";
  if (state.status === "ACTIVE") return "ACTIVE";
  if (state.status === "DISMISSED") return "DISMISSED";
  if (state.status === "SNOOZED") {
    if (!state.snoozedUntil) return "ACTIVE"; // defensive
    return state.snoozedUntil > now ? "SNOOZED" : "ACTIVE";
  }
  return "ACTIVE";
}

/**
 * Filter naar de 3 categorieën zoals de UI ze wil tonen.
 */
export function partitionSignalsByStatus(
  signalsWithState: ReadonlyArray<BehavioralSignalWithState>,
): {
  active: BehavioralSignalWithState[];
  snoozed: BehavioralSignalWithState[];
  dismissed: BehavioralSignalWithState[];
} {
  const active: BehavioralSignalWithState[] = [];
  const snoozed: BehavioralSignalWithState[] = [];
  const dismissed: BehavioralSignalWithState[] = [];
  for (const sig of signalsWithState) {
    if (sig.effectiveStatus === "ACTIVE") active.push(sig);
    else if (sig.effectiveStatus === "SNOOZED") snoozed.push(sig);
    else dismissed.push(sig);
  }
  return { active, snoozed, dismissed };
}
