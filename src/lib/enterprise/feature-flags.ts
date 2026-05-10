/**
 * Enterprise feature-flags — gefaseerde rollout, los van billing-tier.
 *
 * **Resolution-volgorde** (later overschrijft eerder):
 *  1. `DEFAULT_ENTERPRISE_FLAGS` — alles uit
 *  2. Env: `ENTERPRISE_FLAGS_<KEY>` met "true"/"false"
 *  3. Org-override (uit `Organization.featureFlags`) — wanneer er een
 *     organizationId in scope is
 *  4. User-override (uit `UserProfile.preferences.enterpriseFlags`)
 *
 * **Bewuste keuze**: geen externe flag-service (Unleash/LaunchDarkly).
 * Voor de schaal van v1 is een env+JSON-blob-laag genoeg en testbaar
 * zonder I/O.
 */

import {
  DEFAULT_ENTERPRISE_FLAGS,
  type EnterpriseFeatureFlag,
  type Organization,
} from "./types";

export interface FlagResolutionContext {
  /** Optionele org-context. Wanneer afwezig → user-only resolution. */
  organization?: Pick<Organization, "featureFlags"> | null;
  /** Optionele user-flags uit `UserProfile.preferences.enterpriseFlags`. */
  userOverrides?: Partial<Record<EnterpriseFeatureFlag, boolean>> | null;
  /** Optionele env-snapshot voor tests. Default: `process.env`. */
  env?: Record<string, string | undefined>;
}

/**
 * Resolve één flag. Returnt altijd een bool — geen undefined.
 */
export function isEnterpriseFlagEnabled(
  flag: EnterpriseFeatureFlag,
  ctx: FlagResolutionContext = {},
): boolean {
  let value = DEFAULT_ENTERPRISE_FLAGS[flag];

  const env = ctx.env ?? (typeof process !== "undefined" ? process.env : {});
  const envKey = envKeyForFlag(flag);
  const envValue = env[envKey];
  if (envValue === "true") value = true;
  else if (envValue === "false") value = false;

  if (ctx.organization && ctx.organization.featureFlags) {
    const orgValue = ctx.organization.featureFlags[flag];
    if (typeof orgValue === "boolean") value = orgValue;
  }

  if (ctx.userOverrides) {
    const userValue = ctx.userOverrides[flag];
    if (typeof userValue === "boolean") value = userValue;
  }

  return value;
}

/**
 * Resolve alle flags in 1 call — voor server-loaders die het hele
 * flag-state-snapshot doorgeven aan client-componenten.
 */
export function resolveAllFlags(
  ctx: FlagResolutionContext = {},
): Record<EnterpriseFeatureFlag, boolean> {
  const out = { ...DEFAULT_ENTERPRISE_FLAGS };
  for (const flag of Object.keys(DEFAULT_ENTERPRISE_FLAGS) as EnterpriseFeatureFlag[]) {
    out[flag] = isEnterpriseFlagEnabled(flag, ctx);
  }
  return out;
}

/**
 * Parse user-override-blob uit `UserProfile.preferences`. Tolerant:
 * onbekende keys negeren.
 */
export function parseUserFlagOverrides(
  raw: unknown,
): Partial<Record<EnterpriseFeatureFlag, boolean>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const out: Partial<Record<EnterpriseFeatureFlag, boolean>> = {};
  for (const flag of Object.keys(DEFAULT_ENTERPRISE_FLAGS) as EnterpriseFeatureFlag[]) {
    const v = obj[flag];
    if (typeof v === "boolean") out[flag] = v;
  }
  return out;
}

/**
 * Convert flag-key → env-var-naam. `advisor.dashboard` → `ENTERPRISE_FLAGS_ADVISOR_DASHBOARD`.
 */
export function envKeyForFlag(flag: EnterpriseFeatureFlag): string {
  const sanitized = flag.toUpperCase().replace(/[.-]/g, "_");
  return `ENTERPRISE_FLAGS_${sanitized}`;
}
