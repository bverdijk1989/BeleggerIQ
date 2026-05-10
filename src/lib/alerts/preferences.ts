/**
 * Alert-preferences — per type opt-in/out + minimum severity.
 *
 * Stored in `UserProfile.preferences.alerts` JSON-blob (geen aparte
 * tabel, want het is een dunne config-laag). Ontbrekende velden vallen
 * terug op de default uit `ALERT_CATALOG`.
 *
 * **Topbelegger-laag**: Buffett — minimaliseer ruis. Default minSeverity
 * is INFO; gebruikers kunnen 'em verhogen naar WARNING of CRITICAL als
 * ze alleen serieuze signalen willen zien.
 */

import { ALERT_CATALOG } from "./catalog";
import type { AlertSeverity, AlertType } from "./types";

export interface AlertTypePreference {
  enabled: boolean;
  /** Minimum severity om als alert te tonen — `INFO` = alles, `WARNING` =
   *  filter INFO-only, `CRITICAL` = alleen kritieke signalen. */
  minSeverity: AlertSeverity;
}

export type AlertPreferences = Record<AlertType, AlertTypePreference>;

const DEFAULT_MIN_SEVERITY: AlertSeverity = "INFO";

export function buildDefaultAlertPreferences(): AlertPreferences {
  const out = {} as AlertPreferences;
  for (const def of ALERT_CATALOG) {
    out[def.type] = {
      enabled: def.defaultEnabled,
      minSeverity: DEFAULT_MIN_SEVERITY,
    };
  }
  return out;
}

/**
 * Parse uit `UserProfile.preferences.alerts` (Json-blob, untrusted).
 * Tolerant: onbekende velden negeren, ontbrekende krijgen defaults.
 */
export function parseAlertPreferences(raw: unknown): AlertPreferences {
  const defaults = buildDefaultAlertPreferences();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const obj = raw as Record<string, unknown>;
  const out = { ...defaults };
  for (const def of ALERT_CATALOG) {
    const entry = obj[def.type];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    out[def.type] = {
      enabled:
        typeof e.enabled === "boolean" ? e.enabled : defaults[def.type].enabled,
      minSeverity: isAlertSeverity(e.minSeverity)
        ? e.minSeverity
        : defaults[def.type].minSeverity,
    };
  }
  return out;
}

function isAlertSeverity(value: unknown): value is AlertSeverity {
  return value === "INFO" || value === "WARNING" || value === "CRITICAL";
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  INFO: 0,
  WARNING: 1,
  CRITICAL: 2,
};

/**
 * Mag deze candidate doorlaten? Filter-laag tussen generators en
 * persistence.
 */
export function shouldDeliverAlert(
  prefs: AlertPreferences,
  type: AlertType,
  severity: AlertSeverity,
): boolean {
  const pref = prefs[type];
  if (!pref) return false;
  if (!pref.enabled) return false;
  return SEVERITY_RANK[severity] >= SEVERITY_RANK[pref.minSeverity];
}

/**
 * Bouw een `AlertPreferences`-update vanuit een partial input. Maakt het
 * makkelijk om vanuit een UI-form alleen één type bij te werken.
 */
export function mergeAlertPreferences(
  current: AlertPreferences,
  patch: Partial<AlertPreferences>,
): AlertPreferences {
  const out = { ...current };
  for (const [type, value] of Object.entries(patch) as Array<
    [AlertType, AlertTypePreference | undefined]
  >) {
    if (!value) continue;
    out[type] = { ...current[type], ...value };
  }
  return out;
}
