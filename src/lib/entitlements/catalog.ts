/**
 * Feature-catalog — **bron van waarheid** voor pricing + entitlements.
 *
 * Wijzigen van een tier of prijs gebeurt UITSLUITEND in deze file.
 * `canUseFeature(...)` en de pricing-page lezen hieruit; geen if-statements
 * elders in de codebase.
 *
 * Conventies:
 *  - Hogere tier impliceert NIET automatisch alle features van een lagere
 *    tier — `availableIn` is expliciet. Dat maakt downgrade-paths
 *    voorspelbaar (een feature die per ongeluk uit ELITE valt blijft niet
 *    geactiveerd via PRO).
 *  - Limits zijn tier-specifiek; null = unlimited, getal = harde grens.
 *  - Advisor is voorbereid (3 features) maar nog niet actief verkocht.
 */

import type {
  BillingTier,
  FeatureDefinition,
  FeatureKey,
  TierDefinition,
} from "./types";

const ALL_PAID: ReadonlyArray<BillingTier> = ["PRO", "ELITE", "ADVISOR"];
const ELITE_AND_UP: ReadonlyArray<BillingTier> = ["ELITE", "ADVISOR"];
const ALL_TIERS: ReadonlyArray<BillingTier> = ["FREE", "PRO", "ELITE", "ADVISOR"];

export const FEATURE_CATALOG: ReadonlyArray<FeatureDefinition> = [
  // ============================================================
  //  Tracking — basis voor iedereen, met limieten op FREE
  // ============================================================
  {
    key: "portfolio.tracking",
    label: "Portfolio tracking",
    description: "Houd je posities, koersen en P&L bij in real-time.",
    availableIn: ALL_TIERS,
    limits: {
      FREE: 10,
      PRO: 50,
      ELITE: null,
      ADVISOR: null,
    },
    category: "tracking",
  },
  {
    key: "portfolio.unlimited_holdings",
    label: "Onbeperkt aantal posities",
    description: "Geen limiet op het aantal holdings dat je kunt volgen.",
    availableIn: ELITE_AND_UP,
    category: "tracking",
  },
  {
    key: "portfolio.multi_portfolio",
    label: "Meerdere portefeuilles",
    description: "Beheer meerdere portefeuilles naast elkaar.",
    availableIn: ALL_PAID,
    category: "tracking",
  },

  // ============================================================
  //  Health (M1)
  // ============================================================
  {
    key: "health.basic",
    label: "Basis Health Score",
    description: "Eenvoudige spreidings- en risico-score voor je portefeuille.",
    availableIn: ALL_TIERS,
    category: "analytics",
  },
  {
    key: "health.full",
    label: "Volledige Health Score (10 components)",
    description:
      "Alle 10 componenten: spreiding, sectorconcentratie, volatiliteit, drawdown, kwaliteit, waardering, dividend, macro-fit, en meer.",
    availableIn: ALL_PAID,
    category: "analytics",
  },

  // ============================================================
  //  Briefing (M2)
  // ============================================================
  {
    key: "briefing.weekly",
    label: "Weekly briefing",
    description: "Eén keer per week een korte samenvatting.",
    availableIn: ALL_TIERS,
    category: "ai",
  },
  {
    key: "briefing.daily",
    label: "Daily AI briefing",
    description:
      "Persoonlijke analist-memo elke dag — bewegingen, risico's, focuspunt — gegenereerd met hedged AI + guardrails.",
    availableIn: ALL_PAID,
    category: "ai",
  },

  // ============================================================
  //  Behavioral Coach (M3)
  // ============================================================
  {
    key: "behavioral.coach",
    label: "Behavioral Coach",
    description:
      "Detectie van 8 gedragspatronen (overtrading, panic, FOMO, drift) met coachende reflectievragen.",
    availableIn: ALL_PAID,
    category: "analytics",
  },

  // ============================================================
  //  Goals (M4)
  // ============================================================
  {
    key: "goals.basic",
    label: "Eén financieel doel",
    description: "Stel je hoofd-doel in (pensioen, FIRE, huis) met projectie.",
    availableIn: ALL_TIERS,
    limits: {
      FREE: 1,
      PRO: 5,
      ELITE: null,
      ADVISOR: null,
    },
    category: "tracking",
  },
  {
    key: "goals.unlimited",
    label: "Onbeperkt doelen",
    description: "Meerdere doelen tegelijk met scenario's en bijstuur-suggesties.",
    availableIn: ELITE_AND_UP,
    category: "tracking",
  },

  // ============================================================
  //  Macro Regime (M5)
  // ============================================================
  {
    key: "macro.basic",
    label: "Basis macro regime",
    description: "Huidige stance (Goldilocks/Reflation/Stagflation/Deflation) + narrative.",
    availableIn: ALL_PAID,
    category: "analytics",
  },
  {
    key: "macro.full",
    label: "Volledig macroregime",
    description:
      "7 indicatoren, 4-quadrant classificatie, asset-class impact tabel + portfolio-fit met regime-baseline.",
    availableIn: ELITE_AND_UP,
    category: "analytics",
  },

  // ============================================================
  //  Signal Fusion (M6)
  // ============================================================
  {
    key: "signal_fusion.confidence_score",
    label: "Investment Confidence Score",
    description:
      "Per instrument een 0–100 score over 10 transparante signaalbronnen — kwaliteit, waardering, momentum, macro, fit.",
    availableIn: ELITE_AND_UP,
    category: "analytics",
  },

  // ============================================================
  //  AI Explainability (M7)
  // ============================================================
  {
    key: "ai.explainability",
    label: "AI Explainability layer",
    description:
      "Gestructureerde uitleg van je scores: conclusie, waarom-belangrijk, positieven, risico's, mogelijke acties — met source-tracing en hallucination guardrails.",
    availableIn: ELITE_AND_UP,
    category: "ai",
  },

  // ============================================================
  //  Watchlist Intelligence (M9)
  // ============================================================
  {
    key: "watchlist.intelligence",
    label: "Watchlist Intelligence",
    description:
      "Rijk signaal-pakket per watchlist-ticker — 10 signalen (waardering, momentum, volatiliteit, macro-fit, profiel-fit), alternatieven uit jouw universum, en intelligence-gedreven alerts.",
    availableIn: ALL_PAID,
    category: "analytics",
  },

  // ============================================================
  //  Scenario analysis
  // ============================================================
  {
    key: "scenario.basic",
    label: "Basis scenario-analyse",
    description:
      "Een set vooraf-gedefinieerde scenario's (recessie, marktcrash, sectorrotatie) met portfolio-impact.",
    availableIn: ALL_PAID,
    category: "analytics",
  },
  {
    key: "scenario.analysis",
    label: "Volledige scenario- & tail-risk-analyse",
    description:
      "Alle 10 stress-scenarios + custom-builder + per-positie impact-breakdown + AI-uitleg.",
    availableIn: ELITE_AND_UP,
    category: "analytics",
  },

  // ============================================================
  //  Alerts (basis vs premium)
  // ============================================================
  {
    key: "alerts.basic",
    label: "Basis alerts",
    description:
      "Notificaties op kerngebeurtenissen: Health Score-drop, concentratierisico, koersbewegingen, regime-shifts, dividend/earnings-events.",
    availableIn: ALL_PAID,
    category: "alerts",
  },
  {
    key: "alerts.premium",
    label: "Premium alerts",
    description:
      "Geavanceerde notificaties: factor-drift, behavioral red-flags, watchlist-intelligence-signalen, valuation-triggers, lage-datakwaliteit.",
    availableIn: ELITE_AND_UP,
    category: "alerts",
  },

  // ============================================================
  //  Crypto Risk Lab (M12)
  // ============================================================
  {
    key: "crypto.lab",
    label: "Crypto Risk & Momentum Lab",
    description:
      "Aparte lab-sectie voor BTC/ETH: allocatie-tier, volatiliteit, max-drawdown, momentum, trend-sterkte, position-sizing-warning en speculation-score.",
    availableIn: ELITE_AND_UP,
    category: "analytics",
  },

  // ============================================================
  //  Dividend Calendar + DRIP Simulator (M22)
  // ============================================================
  {
    key: "dividend.calendar",
    label: "Dividend-kalender",
    description:
      "Wanneer ontvang je dividend? Per maand verwacht bedrag + ex-dividend/pay-date indien beschikbaar. Heuristische schatting bij ontbrekende feed.",
    availableIn: ALL_TIERS,
    category: "analytics",
  },
  {
    key: "dividend.drip",
    label: "DRIP-simulator (5/10/20 jaar)",
    description:
      "Vergelijk herbeleggen aan/uit over 5, 10 en 20 jaar met conservatief/neutraal/optimistisch rendement. Inclusief jaarlijkse projectie en groei-analyse.",
    availableIn: ALL_PAID,
    category: "analytics",
  },

  // ============================================================
  //  Community Intelligence (M13)
  // ============================================================
  {
    key: "community.benchmark",
    label: "Community benchmark",
    description:
      "Vergelijk je portefeuille anoniem met je cohort: asset-mix, risicoprofiel, dividend-strategie, sectoren en rendement. Privacy-first: opt-in per scope.",
    availableIn: ALL_PAID,
    category: "analytics",
  },

  // ============================================================
  //  Signal Performance Lab (M27) — Elite + Advisor
  // ============================================================
  {
    key: "research.signal_performance",
    label: "Signal Performance Lab",
    description:
      "Research-grade backtest per signaal-component (quality/valuation/momentum/volatility/macrofit/portfoliofit) — per-horizon hit-rate, decay-analyse, regime-breakdown en CSV-export. Voor Elite + Advisor.",
    availableIn: ELITE_AND_UP,
    category: "analytics",
  },

  // ============================================================
  //  Advisor PDF report (M23) — Elite + Advisor
  // ============================================================
  {
    key: "report.advisor_pdf",
    label: "Advisor PDF-rapport",
    description:
      "Professioneel portefeuillecheck-rapport (10 secties — health, risico, spreiding, doelen, scenarios, behavioral, datakwaliteit, actiepunten). Print-friendly HTML met browser-naar-PDF; v2: server-side PDF-render.",
    availableIn: ELITE_AND_UP,
    category: "advisor",
  },

  // ============================================================
  //  Advisor / Enterprise — voorbereid
  // ============================================================
  {
    key: "advisor.multi_client",
    label: "Multi-client beheer",
    description: "Beheer portefeuilles van meerdere cliënten vanuit één dashboard.",
    availableIn: ["ADVISOR"],
    category: "advisor",
  },
  {
    key: "advisor.export_reports",
    label: "Export rapporten",
    description: "Genereer cliënt-rapporten in PDF/Excel met whitelabel-branding.",
    availableIn: ["ADVISOR"],
    category: "advisor",
  },
  {
    key: "advisor.white_label",
    label: "White-label",
    description: "Eigen huisstijl, eigen domein, eigen branding op de app.",
    availableIn: ["ADVISOR"],
    category: "advisor",
  },
  {
    key: "advisor.team_roles",
    label: "Team-rollen",
    description:
      "Meerdere gebruikers binnen één Advisor-account met aparte rollen (read-only, advisor, admin).",
    availableIn: ["ADVISOR"],
    category: "advisor",
  },
];

const FEATURES_BY_KEY: Map<FeatureKey, FeatureDefinition> = new Map(
  FEATURE_CATALOG.map((f) => [f.key, f]),
);

export function getFeature(key: FeatureKey): FeatureDefinition | null {
  return FEATURES_BY_KEY.get(key) ?? null;
}

// ============================================================
//  Tier definitions — pricing-page bron
// ============================================================

export const TIER_CATALOG: ReadonlyArray<TierDefinition> = [
  {
    tier: "FREE",
    label: "Free",
    tagline: "Kennismaken zonder risico",
    description:
      "Begin met basis-tracking, een eenvoudige health-score en een wekelijkse samenvatting.",
    monthlyPriceEur: 0,
    yearlyPriceEur: 0,
    sortOrder: 1,
    ctaLabel: "Gratis starten",
  },
  {
    tier: "PRO",
    label: "Pro",
    tagline: "Voor de bewuste belegger",
    description:
      "Volledige Health Score, dagelijkse AI Briefing, Behavioral Coach en basis macro-regime.",
    monthlyPriceEur: 9.95,
    yearlyPriceEur: 95,
    sortOrder: 2,
    highlight: true,
    ctaLabel: "Upgrade naar Pro",
  },
  {
    tier: "ELITE",
    label: "Elite",
    tagline: "Voor de data-gedreven belegger",
    description:
      "Signal Fusion Engine, AI Explainability, scenario-analyse, full macro-regime en premium alerts.",
    monthlyPriceEur: 24.95,
    yearlyPriceEur: 249,
    sortOrder: 3,
    ctaLabel: "Upgrade naar Elite",
  },
  {
    tier: "ADVISOR",
    label: "Advisor",
    tagline: "Voor adviseurs en vermogensbeheerders",
    description:
      "Multi-client dashboard, export-rapporten en white-label — voorbereid, op aanvraag beschikbaar.",
    monthlyPriceEur: null,
    yearlyPriceEur: null,
    sortOrder: 4,
    ctaLabel: "Plan een gesprek",
  },
];

const TIER_BY_KEY: Map<BillingTier, TierDefinition> = new Map(
  TIER_CATALOG.map((t) => [t.tier, t]),
);

export function getTierDefinition(tier: BillingTier): TierDefinition {
  return TIER_BY_KEY.get(tier) ?? TIER_CATALOG[0]!;
}

/**
 * Tier-rangorde — voor "lower-than"-checks. Hogere index = duurdere tier.
 * Niet gebruikt voor entitlement-logica (die leest `availableIn`), maar
 * wel voor sortering en UI-vergelijking.
 */
export const TIER_RANK: Record<BillingTier, number> = {
  FREE: 0,
  PRO: 1,
  ELITE: 2,
  ADVISOR: 3,
};
