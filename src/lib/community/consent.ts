/**
 * Consent-laag: parse + merge voor `UserProfile.preferences.community`.
 *
 * **Bewuste keuze**: geen aparte DB-tabel voor v1 — we slaan opt-in/-out
 * op in de bestaande JSON-blob (zelfde patroon als alerts en
 * notifications). Migratie naar een dedicated tabel is straightforward
 * wanneer we ook contributie-history willen bijhouden.
 *
 * **Default-deny**: ontbrekende velden = scope NIET gegeven. Geen impliciete
 * consents; geen migration-magic die opties aanzet.
 */

import {
  CONSENT_SCOPE_ORDER,
  CONSENT_TEXT_VERSION,
  type CommunityConsent,
  type ConsentScope,
} from "./types";

export const DEFAULT_CONSENT: CommunityConsent = {
  scopes: [],
  updatedAt: null,
  consentTextVersion: 0,
};

function isConsentScope(value: unknown): value is ConsentScope {
  return (
    typeof value === "string" &&
    (CONSENT_SCOPE_ORDER as ReadonlyArray<string>).includes(value)
  );
}

/**
 * Parse uit `UserProfile.preferences.community` (Json-blob, untrusted).
 * Tolerant: onbekende velden negeren, ontbrekende = default-deny.
 */
export function parseCommunityConsent(raw: unknown): CommunityConsent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_CONSENT };
  }
  const obj = raw as Record<string, unknown>;

  const scopesRaw = Array.isArray(obj.scopes) ? obj.scopes : [];
  const scopes = (scopesRaw.filter(isConsentScope) as ConsentScope[]).filter(
    (scope, idx, arr) => arr.indexOf(scope) === idx,
  );

  const updatedAt =
    typeof obj.updatedAt === "string" && obj.updatedAt.length >= 10
      ? obj.updatedAt
      : null;
  const versionRaw = obj.consentTextVersion;
  const consentTextVersion =
    typeof versionRaw === "number" && Number.isInteger(versionRaw) && versionRaw >= 0
      ? versionRaw
      : 0;

  return { scopes, updatedAt, consentTextVersion };
}

/**
 * Bouw een nieuwe consent-state vanuit een gewenste scope-set. Trim
 * dubbelen, sorteer canonical, stamp updatedAt + consentTextVersion.
 */
export function buildConsent(
  desiredScopes: Iterable<ConsentScope>,
  now: Date = new Date(),
): CommunityConsent {
  const set = new Set<ConsentScope>();
  for (const s of desiredScopes) {
    if (isConsentScope(s)) set.add(s);
  }
  const ordered = CONSENT_SCOPE_ORDER.filter((s) => set.has(s));
  return {
    scopes: ordered,
    updatedAt: now.toISOString(),
    consentTextVersion: CONSENT_TEXT_VERSION,
  };
}

/**
 * Heeft de gebruiker opt-in op deze scope?
 */
export function hasConsent(
  consent: CommunityConsent,
  scope: ConsentScope,
): boolean {
  return consent.scopes.includes(scope);
}

/**
 * Mag deze user al meedoen aan community-features? Antwoord: zodra hij
 * minstens 1 scope opt-in heeft. Anders moet de UI eerst de
 * consent-flow tonen.
 */
export function isContributing(consent: CommunityConsent): boolean {
  return consent.scopes.length > 0;
}
