"use server";

import { cookies } from "next/headers";

import { resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { matchesSessionUser } from "@/lib/auth";

import {
  ALL_PORTFOLIOS_KEYWORD,
  SELECTION_COOKIE,
} from "./selector";

/**
 * Server-action: bewaar de keuze van de switcher als cookie.
 *
 * De UI navigeert primair via `?p=...` (URL-state); deze action wordt
 * **na** de navigation opgeroepen zodat directe bezoeken (bv. typen
 * `/dashboard` zonder query) de laatst-gekozen portefeuille onthouden.
 *
 * Security:
 *   - We lezen alleen *eigen* portefeuilles (findByUserId) om te
 *     valideren dat de meegestuurde id bij de actieve session-user hoort.
 *   - Schrijven naar een vreemde id is daarmee onmogelijk.
 */

export async function setActivePortfolio(value: string): Promise<void> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return;

  const trimmed = (value ?? "").trim();
  if (!trimmed) return;

  if (trimmed !== ALL_PORTFOLIOS_KEYWORD) {
    const ownerEmail = await portfolioRepository.findOwnerEmailById(trimmed);
    if (!ownerEmail) return;
    if (!matchesSessionUser(auth.user, ownerEmail)) return;
  }

  const store = await cookies();
  store.set(SELECTION_COOKIE, trimmed, {
    httpOnly: false, // niet gevoelig — bevat alleen een UI-preference
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 jaar
  });
}
