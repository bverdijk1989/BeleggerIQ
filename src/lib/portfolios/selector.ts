/**
 * Portfolio-selector — pure logica voor het bepalen van de "actieve"
 * portefeuille per request.
 *
 * Bewuste keuzes:
 *
 *   1. **URL state preferred.** Een `?p=<id>` of `?p=all` query-param wint
 *      altijd. Reden: deelbare links, browser-back werkt, en een server
 *      component kan met alleen `searchParams` zónder cookie-roundtrip
 *      al de juiste scope renderen.
 *   2. **Cookie als fallback.** Wanneer de user op de switcher klikt
 *      schrijven we `biq_portfolio_id` zodat directe nav (bv. typen
 *      `/dashboard`) onthoudt waar de gebruiker stond.
 *   3. **Primary als final fallback.** Single-portfolio users zien dus
 *      géén extra complexity — ze hebben geen URL-param, geen cookie,
 *      en de selector pakt automatisch de primary.
 *   4. **`all` is een eersteklas waarde.** Niet impliciet "geen
 *      selectie" — we modelleren 'em als `kind: "all"` zodat pages
 *      expliciet ja/nee kunnen kiezen om aggregate-mode te ondersteunen.
 *
 * Geen Prisma, geen cookies-API, geen Next-imports — pure functie.
 */

export interface PortfolioStub {
  id: string;
  name: string;
  isPrimary: boolean;
}

export type SelectionInput = {
  available: PortfolioStub[];
  /** Raw `?p=` query param (mag null/undefined zijn). */
  urlParam?: string | null;
  /** Raw cookie value (mag null/undefined zijn). */
  cookieValue?: string | null;
};

export type Selection =
  | { kind: "single"; portfolioId: string; source: "url" | "cookie" | "primary"; isExplicit: boolean }
  | { kind: "all"; source: "url" }
  | { kind: "empty" };

const ALL_KEYWORD = "all";

function isKnownId(id: string, available: PortfolioStub[]): boolean {
  return available.some((p) => p.id === id);
}

export function resolveSelection(input: SelectionInput): Selection {
  const { available } = input;
  if (available.length === 0) {
    return { kind: "empty" };
  }

  // 1) URL param
  const url = (input.urlParam ?? "").trim();
  if (url) {
    if (url === ALL_KEYWORD) {
      return { kind: "all", source: "url" };
    }
    if (isKnownId(url, available)) {
      return {
        kind: "single",
        portfolioId: url,
        source: "url",
        isExplicit: true,
      };
    }
    // URL bevat een onbekende id (bv. typo, andere user) → val terug op
    // primary maar markeer 'em niet als explicit. UI kan dat later
    // gebruiken voor een 'we hebben je naar je primary geleid' hint.
  }

  // 2) Cookie
  const cookie = (input.cookieValue ?? "").trim();
  if (cookie) {
    if (cookie === ALL_KEYWORD) {
      return { kind: "all", source: "url" };
    }
    if (isKnownId(cookie, available)) {
      return {
        kind: "single",
        portfolioId: cookie,
        source: "cookie",
        isExplicit: true,
      };
    }
  }

  // 3) Primary fallback
  const primary = available.find((p) => p.isPrimary) ?? available[0]!;
  return {
    kind: "single",
    portfolioId: primary.id,
    source: "primary",
    isExplicit: false,
  };
}

/**
 * Bouw een href voor de switcher. Houdt bestaande searchParams zoveel
 * mogelijk in stand zodat een filter-keuze (bv. ?year=2025 op /transacties)
 * niet kwijt raakt bij een portfolio-switch.
 */
export function buildSwitchHref(
  pathname: string,
  currentSearch: string,
  targetPortfolioId: string | "all",
): string {
  const params = new URLSearchParams(currentSearch ?? "");
  params.set("p", targetPortfolioId);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export const SELECTION_COOKIE = "biq_portfolio_id";
export const SELECTION_QUERY_PARAM = "p";
export const ALL_PORTFOLIOS_KEYWORD = ALL_KEYWORD;
