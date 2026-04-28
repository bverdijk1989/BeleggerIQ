/**
 * Notification preferences — single source of truth voor de user-keuze
 * "wat wil ik wel/niet ontvangen?".
 *
 * Persisted as Json in `UserProfile.notifications`. NULL/missing = alle
 * defaults aan zodat onboarding-users iets ontvangen ipv "geen mails
 * meer ooit"; later kan je 'em altijd uitzetten.
 */

export interface NotificationPreferences {
  weeklyDigest: boolean;
  /** Critical = position cap exceeded, fragile concentration, regime switch. */
  instantCriticalAlerts: boolean;
  /** Watchlist target-zone-reached / valuation-band-reached. */
  watchlistAlerts: boolean;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  weeklyDigest: true,
  instantCriticalAlerts: true,
  watchlistAlerts: true,
};

/**
 * Parse uit Prisma-Json. Tolerant: onbekende velden negeren, ontbrekende
 * velden krijgen defaults. Reden: schema-Json laat unsafe casts toe en
 * we willen geen runtime-crash op een typo.
 */
export function parsePreferences(
  raw: unknown,
): NotificationPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFERENCES };
  const obj = raw as Record<string, unknown>;
  return {
    weeklyDigest:
      typeof obj.weeklyDigest === "boolean"
        ? obj.weeklyDigest
        : DEFAULT_PREFERENCES.weeklyDigest,
    instantCriticalAlerts:
      typeof obj.instantCriticalAlerts === "boolean"
        ? obj.instantCriticalAlerts
        : DEFAULT_PREFERENCES.instantCriticalAlerts,
    watchlistAlerts:
      typeof obj.watchlistAlerts === "boolean"
        ? obj.watchlistAlerts
        : DEFAULT_PREFERENCES.watchlistAlerts,
  };
}

/**
 * Bepaal welk kanaal/policy een specifieke event zou krijgen voor deze
 * user. Splitst de "preference"-laag uit van de "event-generation"-laag,
 * zodat een test alleen prefs hoeft door te geven.
 */
export type NotificationCategory = "critical" | "watchlist" | "digest";

export function isCategoryAllowed(
  prefs: NotificationPreferences,
  category: NotificationCategory,
): boolean {
  switch (category) {
    case "critical":
      return prefs.instantCriticalAlerts;
    case "watchlist":
      return prefs.watchlistAlerts;
    case "digest":
      return prefs.weeklyDigest;
  }
}
