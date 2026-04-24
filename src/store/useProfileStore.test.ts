import { beforeEach, describe, expect, it } from "vitest";

import { useProfileStore } from "./useProfileStore";
import type { UserProfile } from "@/types/profile";

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "p1",
    userId: "u1",
    investorType: "LONG_TERM",
    objective: "BALANCED",
    riskTolerance: "BALANCED",
    investmentHorizonYrs: 15,
    monthlyContribution: 500,
    baseCurrency: "EUR",
    taxResidency: "NL",
    goals: [{ id: "g1", label: "Pensioen" }],
    preferences: {},
    policy: { maxPositionWeight: 0.1 },
    ...overrides,
  };
}

beforeEach(() => {
  useProfileStore.getState().reset();
});

describe("useProfileStore", () => {
  it("hydrate kopieert policy en objective uit het profiel", () => {
    useProfileStore.getState().hydrate(makeProfile());
    const state = useProfileStore.getState();
    expect(state.profile?.id).toBe("p1");
    expect(state.policy?.maxPositionWeight).toBe(0.1);
    expect(state.currentObjective).toBe("BALANCED");
  });

  it("completeness wordt berekend op basis van aanwezige velden", () => {
    useProfileStore.getState().hydrate(makeProfile());
    expect(useProfileStore.getState().completeness.isComplete).toBe(true);

    useProfileStore.getState().hydrate(
      makeProfile({
        goals: [],
        policy: undefined,
        monthlyContribution: null,
      }),
    );
    const state = useProfileStore.getState();
    expect(state.completeness.isComplete).toBe(false);
    expect(state.completeness.missing).toEqual(
      expect.arrayContaining(["goals", "policy", "monthlyContribution"]),
    );
  });

  it("tilts worden geclampt tot het bereik -1..1", () => {
    useProfileStore.getState().setRegionTilt("EU", 1.7);
    useProfileStore.getState().setSectorTilt("Tech", -5);
    useProfileStore.getState().setDividendPreference(Number.NaN);

    const prefs = useProfileStore.getState().preferences;
    expect(prefs.regionTilts.EU).toBe(1);
    expect(prefs.sectorTilts.Tech).toBe(-1);
    expect(prefs.dividendPreference).toBe(0);
  });

  it("patchPolicy merget incrementeel en behoudt completeness-update", () => {
    useProfileStore.getState().hydrate(makeProfile({ policy: undefined }));
    expect(useProfileStore.getState().completeness.missing).toContain("policy");

    useProfileStore.getState().patchPolicy({ maxSectorWeight: 0.35 });
    const state = useProfileStore.getState();
    expect(state.policy?.maxSectorWeight).toBe(0.35);
    expect(state.completeness.missing).not.toContain("policy");
  });

  it("commitPolicyToProfile schrijft draft policy terug op profile", () => {
    useProfileStore.getState().hydrate(makeProfile({ policy: undefined }));
    useProfileStore.getState().patchPolicy({ minPositions: 5 });
    useProfileStore.getState().commitPolicyToProfile();
    expect(useProfileStore.getState().profile?.policy?.minPositions).toBe(5);
  });
});
