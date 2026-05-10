/**
 * i18n locale-bestanden — flat key/value strings.
 *
 * Bewust **één file met alle locales** voor de MVP-fase i.p.v. losse
 * JSON-files per taal. Reden: TypeScript checkt key-completeness
 * (elke nieuwe key moet in alle locales komen, anders compile-error)
 * en de hot-pad-laag laadt alles in één import zonder runtime-fetches.
 *
 * Bij groei naar > 500 keys of meer dan 3 talen: split per locale,
 * lazy-load on-demand. Voor nu (<200 keys, NL+EN) overkill.
 *
 * **Conventies**:
 *  - Keys zijn `dot.notation` per scope: `nav.dashboard`, `compliance.banner.body`.
 *  - Pluralization gaat via `_one`/`_other` postfix wanneer nodig
 *    (M26 follow-up — niet in MVP).
 *  - **Geen interpolatie via `{{name}}`** in deze MVP — als je dynamische
 *    waarden wilt, gebruik string-concat in de caller (template-literals).
 *    Hou de translations zonder side-effects.
 */

export type Locale = "nl" | "en";

export const SUPPORTED_LOCALES: readonly Locale[] = ["nl", "en"] as const;
export const DEFAULT_LOCALE: Locale = "nl";

/**
 * Translation-keys + NL-strings. EN-versies leven in `en.ts`.
 * Bij toevoegen van een key: zorg dat dezelfde key in beide taal-bestanden
 * voorkomt — TypeScript dwingt dit af via de `Translations`-type.
 */
export const NL_TRANSLATIONS = {
  // ============================================================
  //  Navigation (sidebar + top-bar)
  // ============================================================
  "nav.dashboard": "Dashboard",
  "nav.portfolio": "Portefeuille",
  "nav.risico": "Risico",
  "nav.maandbeslissing": "Maandbeslissing",
  "nav.kansen": "Kansen",
  "nav.screener": "Screener",
  "nav.strategy_lab": "Strategy Lab",
  "nav.backtest": "Backtest",
  "nav.transacties": "Transacties",
  "nav.belasting": "Belasting",
  "nav.watchlist": "Watchlist",
  "nav.chat": "Chat",
  "nav.profiel": "Profiel",
  "nav.methodologie": "Methodologie",

  // ============================================================
  //  Common UI
  // ============================================================
  "common.loading": "Laden…",
  "common.save": "Opslaan",
  "common.cancel": "Annuleren",
  "common.continue": "Doorgaan",
  "common.back": "Terug",
  "common.next": "Volgende",
  "common.skip": "Overslaan",
  "common.error": "Er is iets fout gegaan",
  "common.success": "Gelukt",
  "common.empty_state": "Nog geen data",

  // ============================================================
  //  Compliance banner (geldt globaal — zie M25-mitigation)
  // ============================================================
  "compliance.title": "Geen formeel beleggings- of belastingadvies",
  "compliance.body":
    "BeleggerIQ levert analyse, geen beleggings- of belastingadvies. Cijfers zijn deterministisch afgeleid uit publieke data en jouw broker-historie. Je bent zelf verantwoordelijk voor het plaatsen van orders en je aangifte — verifieer beslissingen met een onafhankelijk adviseur waar nodig.",

  // ============================================================
  //  Onboarding (M22)
  // ============================================================
  "onboarding.welcome.title": "Welkom bij BeleggerIQ",
  "onboarding.welcome.subtitle":
    "In drie stappen klaar om je portefeuille te analyseren.",
  "onboarding.step1.title": "Stap 1 — beleggersprofiel",
  "onboarding.step1.description":
    "Vertel ons je horizon, doelen en risicotolerantie. Dat bepaalt hoe scores en adviezen worden afgestemd.",
  "onboarding.step2.title": "Stap 2 — eerste portefeuille",
  "onboarding.step2.description":
    "Maak een portefeuille aan en importeer optioneel je DEGIRO-export. Je kan dit later aanpassen.",
  "onboarding.step3.title": "Stap 3 — eerste snapshot",
  "onboarding.step3.description":
    "We maken nu één snapshot van je beginstand. Vanaf hier groeit je historiek mee met elke maandbeslissing.",
  "onboarding.complete": "Onboarding voltooid",
  "onboarding.complete_message":
    "Je dashboard staat klaar. Je kan altijd terugkomen via /onboarding voor extra setup.",

  // ============================================================
  //  Locale-switcher
  // ============================================================
  "locale.switcher.label": "Taal",
  "locale.nl": "Nederlands",
  "locale.en": "English",
} as const;

export type TranslationKey = keyof typeof NL_TRANSLATIONS;
export type Translations = Record<TranslationKey, string>;

/**
 * Engelse vertalingen. Type-safe: TS faalt als één key ontbreekt of
 * extra keys toegevoegd zijn. Onze CI vangt dit; lokaal voorkomt dat
 * een vergeten EN-vertaling tot productie reist.
 */
export const EN_TRANSLATIONS: Translations = {
  "nav.dashboard": "Dashboard",
  "nav.portfolio": "Portfolio",
  "nav.risico": "Risk",
  "nav.maandbeslissing": "Monthly decision",
  "nav.kansen": "Opportunities",
  "nav.screener": "Screener",
  "nav.strategy_lab": "Strategy Lab",
  "nav.backtest": "Backtest",
  "nav.transacties": "Transactions",
  "nav.belasting": "Tax",
  "nav.watchlist": "Watchlist",
  "nav.chat": "Chat",
  "nav.profiel": "Profile",
  "nav.methodologie": "Methodology",

  "common.loading": "Loading…",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.continue": "Continue",
  "common.back": "Back",
  "common.next": "Next",
  "common.skip": "Skip",
  "common.error": "Something went wrong",
  "common.success": "Done",
  "common.empty_state": "No data yet",

  "compliance.title": "Not formal investment or tax advice",
  "compliance.body":
    "BeleggerIQ provides analysis, not investment or tax advice. Numbers are deterministically derived from public data and your broker history. You remain responsible for placing orders and filing your taxes — verify decisions with an independent advisor where appropriate.",

  "onboarding.welcome.title": "Welcome to BeleggerIQ",
  "onboarding.welcome.subtitle":
    "Three steps to start analyzing your portfolio.",
  "onboarding.step1.title": "Step 1 — investor profile",
  "onboarding.step1.description":
    "Tell us your horizon, goals and risk tolerance. This shapes how scores and recommendations are calibrated.",
  "onboarding.step2.title": "Step 2 — first portfolio",
  "onboarding.step2.description":
    "Create a portfolio and optionally import your DEGIRO export. You can adjust this later.",
  "onboarding.step3.title": "Step 3 — first snapshot",
  "onboarding.step3.description":
    "We'll capture one snapshot of your starting position. From here on, your history grows with every monthly decision.",
  "onboarding.complete": "Onboarding complete",
  "onboarding.complete_message":
    "Your dashboard is ready. You can return to /onboarding any time for additional setup.",

  "locale.switcher.label": "Language",
  "locale.nl": "Dutch",
  "locale.en": "English",
};

export const TRANSLATIONS: Record<Locale, Translations> = {
  nl: NL_TRANSLATIONS,
  en: EN_TRANSLATIONS,
};
