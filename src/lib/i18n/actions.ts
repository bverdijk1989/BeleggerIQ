"use server";

import { cookies } from "next/headers";

import { LOCALE_COOKIE, normalizeLocale, type Locale } from ".";

/**
 * Server action — schrijft de gekozen locale als cookie zodat 'em
 * persisteert tussen sessies. Wordt opgeroepen vanuit de
 * `LocaleSwitcher` client-component.
 */
export async function setLocale(value: string): Promise<void> {
  const locale: Locale = normalizeLocale(value);
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    httpOnly: false, // niet gevoelig — UI-preference
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 jaar
  });
}
