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
  /**
   * Module 34 — Monthly Investor Review per e-mail. Default aan voor
   * onboarding-retentie; uitschrijfbaar via preference-settings of
   * unsubscribe-link.
   */
  monthlyReview: boolean;
  /**
   * Module 34 — privacy opt-in. Default UIT: e-mail toont alleen
   * privacy-veilige samenvattingen (grades, deltas, kwalitatieve labels).
   * Wanneer expliciet AAN: e-mail mag ook bedragen en exacte cijfers tonen.
   */
  monthlyReviewDetailedFigures: boolean;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  weeklyDigest: true,
  instantCriticalAlerts: true,
  watchlistAlerts: true,
  monthlyReview: true,
  monthlyReviewDetailedFigures: false,
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
    monthlyReview:
      typeof obj.monthlyReview === "boolean"
        ? obj.monthlyReview
        : DEFAULT_PREFERENCES.monthlyReview,
    monthlyReviewDetailedFigures:
      typeof obj.monthlyReviewDetailedFigures === "boolean"
        ? obj.monthlyReviewDetailedFigures
        : DEFAULT_PREFERENCES.monthlyReviewDetailedFigures,
  };
}

/**
 * Bepaal welk kanaal/policy een specifieke event zou krijgen voor deze
 * user. Splitst de "preference"-laag uit van de "event-generation"-laag,
 * zodat een test alleen prefs hoeft door te geven.
 */
export type NotificationCategory =
  | "critical"
  | "watchlist"
  | "digest"
  | "monthly_review";

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
    case "monthly_review":
      return prefs.monthlyReview;
  }
}
