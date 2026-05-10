/**
 * i18n entry-point. Pure helpers — geen React-deps, geen async I/O.
 *
 * Resolution-volgorde voor de actieve locale:
 *   1. URL-state (later toe te voegen via Next 16 i18n-routing)
 *   2. Cookie `biq_locale`
 *   3. UserProfile.locale uit DB
 *   4. Browser Accept-Language (alleen client-side via fetch-helper)
 *   5. DEFAULT_LOCALE (`nl`)
 *
 * Voor de M26 MVP wired we de cookie + profile-fallback. URL-routing
 * (`/en/dashboard`) volgt in een latere sprint zodat we eerst
 * gebruikers-feedback over de translatie-kwaliteit kunnen verzamelen
 * vóór we de URL-shape vastpinnen.
 */

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  TRANSLATIONS,
  type Locale,
  type TranslationKey,
} from "./locales";

export const LOCALE_COOKIE = "biq_locale";

/**
 * Translate-helper. Faalt nooit — bij een onbekende key returnen we
 * de key zelf zodat een ontwikkelaar 'em direct ziet en niet een
 * `undefined` of lege string die door zou kunnen sluipen.
 */
export function t(key: TranslationKey, locale: Locale = DEFAULT_LOCALE): string {
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE];
  const value = dict[key];
  if (typeof value === "string") return value;
  // Fallback: probeer NL als de gegeven locale 'em mist.
  const fallback = TRANSLATIONS[DEFAULT_LOCALE][key];
  return fallback ?? key;
}

/**
 * Valideer en normaliseer een willekeurige string naar een
 * supported `Locale`. Onbekend → DEFAULT_LOCALE.
 */
export function normalizeLocale(value: unknown): Locale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const lower = value.toLowerCase().split("-")[0]; // "en-US" → "en"
  if (SUPPORTED_LOCALES.includes(lower as Locale)) {
    return lower as Locale;
  }
  return DEFAULT_LOCALE;
}

/**
 * Server-side locale-resolver. Roept Next's `cookies()` aan en valt
 * terug op een meegegeven profile-locale of de default.
 *
 * Wrapped in een try/catch zodat 'em ook in test-context werkt waar
 * `cookies()` niet beschikbaar is.
 */
export async function resolveServerLocale(
  profileLocale?: string | null,
): Promise<Locale> {
  try {
    // Lazy import — alleen in server-context beschikbaar.
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const cookieValue = store.get(LOCALE_COOKIE)?.value;
    if (cookieValue) {
      return normalizeLocale(cookieValue);
    }
  } catch {
    // Niet in server-context (test, browser-component) — fall through.
  }
  if (profileLocale) {
    return normalizeLocale(profileLocale);
  }
  return DEFAULT_LOCALE;
}

export {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  TRANSLATIONS,
  type Locale,
  type TranslationKey,
} from "./locales";
