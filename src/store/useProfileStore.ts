"use client";

import { create } from "zustand";

import type {
  InvestmentObjective,
  InvestorPreferences,
  PolicySettings,
  ProfileCompleteness,
  UserProfile,
} from "@/types/profile";

/**
 * Profile store.
 *
 * State boundaries:
 *  - `profile` is de server-canonieke shape. Niets hier wordt persisted —
 *    verse hydrate per sessie vermijdt stale policy-regels die de
 *    allocation engine verkeerd zouden aansturen.
 *  - `policy` wordt apart bijgehouden als bewerkbare draft. Bij `hydrate`
 *    komt die uit `profile.policy`; bij `commitPolicyToProfile` gaat hij terug.
 *  - `preferences` zijn client-tilts (regio/sector/dividend/momentum). Deze
 *    worden verwerkt door de allocation engine maar staan los van policy.
 *  - `completeness` is een afgeleid veld; producers kunnen `recalculate`
 *    aanroepen na elke patch om de wizard-UI bij te werken.
 */

const DEFAULT_PREFERENCES: InvestorPreferences = {
  regionTilts: {},
  sectorTilts: {},
  dividendPreference: 0,
  momentumPreference: 0,
};

const DEFAULT_COMPLETENESS: ProfileCompleteness = {
  isComplete: false,
  score: 0,
  missing: ["objective", "riskTolerance", "horizon", "goals", "policy"],
};

interface ProfileStateValues {
  profile: UserProfile | null;
  policy: PolicySettings | null;
  currentObjective: InvestmentObjective | null;
  preferences: InvestorPreferences;
  completeness: ProfileCompleteness;
  isLoading: boolean;
  error: string | null;
}

interface ProfileStateActions {
  hydrate: (profile: UserProfile | null) => void;
  patchProfile: (patch: Partial<UserProfile>) => void;

  setPolicy: (policy: PolicySettings | null) => void;
  patchPolicy: (patch: Partial<PolicySettings>) => void;
  /** Synchroniseer de draft policy terug naar het profiel. */
  commitPolicyToProfile: () => void;

  setObjective: (objective: InvestmentObjective) => void;

  setPreferences: (preferences: Partial<InvestorPreferences>) => void;
  setRegionTilt: (region: string, tilt: number) => void;
  setSectorTilt: (sector: string, tilt: number) => void;
  setDividendPreference: (value: number) => void;
  setMomentumPreference: (value: number) => void;
  resetPreferences: () => void;

  setCompleteness: (completeness: ProfileCompleteness) => void;
  recalculateCompleteness: () => void;

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export type ProfileStore = ProfileStateValues & ProfileStateActions;

const INITIAL: ProfileStateValues = {
  profile: null,
  policy: null,
  currentObjective: null,
  preferences: DEFAULT_PREFERENCES,
  completeness: DEFAULT_COMPLETENESS,
  isLoading: false,
  error: null,
};

/**
 * Clamp een scalar in -1..1. Ongeldige waarden worden genegeerd door 0 te
 * retourneren zodat de allocation engine niet op NaN's slaat.
 */
function clampTilt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < -1) return -1;
  if (value > 1) return 1;
  return value;
}

/**
 * Bepaalt welke velden ontbreken en geeft een gewogen score 0..1.
 * Gewichten optellend naar 1; policy telt relatief zwaarder omdat alle
 * downstream engines eraan moeten voldoen.
 */
function deriveCompleteness(
  profile: UserProfile | null,
  policy: PolicySettings | null,
  objective: InvestmentObjective | null,
): ProfileCompleteness {
  if (!profile) return DEFAULT_COMPLETENESS;

  const checks: Array<{
    field: ProfileCompleteness["missing"][number];
    weight: number;
    present: boolean;
  }> = [
    { field: "objective", weight: 0.15, present: Boolean(objective) },
    {
      field: "riskTolerance",
      weight: 0.15,
      present: Boolean(profile.riskTolerance),
    },
    {
      field: "horizon",
      weight: 0.15,
      present: profile.investmentHorizonYrs > 0,
    },
    {
      field: "monthlyContribution",
      weight: 0.1,
      present:
        profile.monthlyContribution !== undefined &&
        profile.monthlyContribution !== null,
    },
    { field: "goals", weight: 0.15, present: profile.goals.length > 0 },
    { field: "policy", weight: 0.3, present: Boolean(policy) },
  ];

  const score = checks.reduce(
    (sum, check) => sum + (check.present ? check.weight : 0),
    0,
  );
  const missing = checks.filter((c) => !c.present).map((c) => c.field);

  return { isComplete: missing.length === 0, score, missing };
}

export const useProfileStore = create<ProfileStore>((set) => ({
  ...INITIAL,

  hydrate: (profile) =>
    set(() => {
      const policy = profile?.policy ?? null;
      const currentObjective = profile?.objective ?? null;
      return {
        profile,
        policy,
        currentObjective,
        completeness: deriveCompleteness(profile, policy, currentObjective),
        isLoading: false,
        error: null,
      };
    }),

  patchProfile: (patch) =>
    set((state) => {
      if (!state.profile) return state;
      const profile = { ...state.profile, ...patch };
      return {
        profile,
        currentObjective: profile.objective ?? state.currentObjective,
        completeness: deriveCompleteness(
          profile,
          state.policy,
          profile.objective ?? state.currentObjective,
        ),
      };
    }),

  setPolicy: (policy) =>
    set((state) => ({
      policy,
      completeness: deriveCompleteness(
        state.profile,
        policy,
        state.currentObjective,
      ),
    })),
  patchPolicy: (patch) =>
    set((state) => {
      const policy = { ...(state.policy ?? {}), ...patch };
      return {
        policy,
        completeness: deriveCompleteness(
          state.profile,
          policy,
          state.currentObjective,
        ),
      };
    }),
  commitPolicyToProfile: () =>
    set((state) => {
      if (!state.profile || !state.policy) return state;
      return { profile: { ...state.profile, policy: state.policy } };
    }),

  setObjective: (objective) =>
    set((state) => ({
      currentObjective: objective,
      profile: state.profile ? { ...state.profile, objective } : state.profile,
      completeness: deriveCompleteness(state.profile, state.policy, objective),
    })),

  setPreferences: (preferences) =>
    set((state) => ({
      preferences: { ...state.preferences, ...preferences },
    })),
  setRegionTilt: (region, tilt) =>
    set((state) => ({
      preferences: {
        ...state.preferences,
        regionTilts: {
          ...state.preferences.regionTilts,
          [region]: clampTilt(tilt),
        },
      },
    })),
  setSectorTilt: (sector, tilt) =>
    set((state) => ({
      preferences: {
        ...state.preferences,
        sectorTilts: {
          ...state.preferences.sectorTilts,
          [sector]: clampTilt(tilt),
        },
      },
    })),
  setDividendPreference: (value) =>
    set((state) => ({
      preferences: {
        ...state.preferences,
        dividendPreference: clampTilt(value),
      },
    })),
  setMomentumPreference: (value) =>
    set((state) => ({
      preferences: {
        ...state.preferences,
        momentumPreference: clampTilt(value),
      },
    })),
  resetPreferences: () => set({ preferences: DEFAULT_PREFERENCES }),

  setCompleteness: (completeness) => set({ completeness }),
  recalculateCompleteness: () =>
    set((state) => ({
      completeness: deriveCompleteness(
        state.profile,
        state.policy,
        state.currentObjective,
      ),
    })),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set(INITIAL),
}));

// Convenience selector
export function selectIsProfileComplete(state: ProfileStore): boolean {
  return state.completeness.isComplete;
}
