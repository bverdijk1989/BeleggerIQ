/**
 * Entitlement-types — feature-flags + tier-mapping.
 *
 * **Filosofie**: één catalog (`./catalog.ts`) is de bron-van-waarheid
 * voor welke feature in welke tier zit. Alle paywalls / feature-checks
 * lezen uit de catalog — wijzigen van pricing = één file aanpassen, geen
 * scattered if-statements door de codebase.
 *
 * **Geen black-box**: elke feature heeft een NL-label + beschrijving
 * zodat de pricing-page automatisch up-to-date blijft.
 */

import type { BillingTier } from "@/types/profile";

export type { BillingTier };

/**
 * Stable feature-keys. Wijzig nooit een bestaande key (DB-state, audit-
 * logs en analytics zijn er aan gekoppeld). Voeg alleen toe.
 */
export type FeatureKey =
  // Portfolio tracking — basis voor iedereen, met limieten op gratis tier.
  | "portfolio.tracking"
  | "portfolio.unlimited_holdings"
  | "portfolio.multi_portfolio"
  // Health (M1)
  | "health.basic"
  | "health.full"
  // AI Briefing (M2)
  | "briefing.weekly"
  | "briefing.daily"
  // Behavioral Coach (M3)
  | "behavioral.coach"
  // Goals (M4)
  | "goals.basic"
  | "goals.unlimited"
  // Macro Regime (M5)
  | "macro.basic"
  | "macro.full"
  // Signal Fusion (M6)
  | "signal_fusion.confidence_score"
  // AI Explainability (M7)
  | "ai.explainability"
  // Watchlist Intelligence (M9)
  | "watchlist.intelligence"
  // Scenario-analyse + tail-risk
  | "scenario.basic"
  | "scenario.analysis"
  // Alerts
  | "alerts.basic"
  | "alerts.premium"
  // Crypto Risk Lab (M12)
  | "crypto.lab"
  // Community Intelligence (M13)
  | "community.benchmark"
  // Advisor / Enterprise (toekomst)
  | "advisor.multi_client"
  | "advisor.export_reports"
  | "advisor.white_label"
  | "advisor.team_roles";

/**
 * Eén feature-definitie in de catalog.
 *
 * `availableIn`: lijst tiers waarin de feature beschikbaar is. Een tier
 * heeft toegang tot alle features waarin hij voorkomt. Tiers stapelen
 * NIET automatisch — dat zou betekenen dat een ELITE-only feature ook
 * voor PRO geldt; we maken expliciet welke tiers toegang hebben.
 *
 * `limit`: optionele numerieke ondergrens (bv. max-holdings, max-doelen).
 * `null` = unlimited.
 */
export interface FeatureDefinition {
  key: FeatureKey;
  /** UI-label (NL). */
  label: string;
  /** 1-zin uitleg voor pricing-page. */
  description: string;
  /** Welke tiers de feature mogen gebruiken. */
  availableIn: ReadonlyArray<BillingTier>;
  /** Optionele limit per tier (alleen voor numeric features). */
  limits?: Partial<Record<BillingTier, number | null>>;
  /** Categorie voor groepering in de UI. */
  category: FeatureCategory;
}

export type FeatureCategory =
  | "tracking"
  | "analytics"
  | "ai"
  | "alerts"
  | "advisor";

/** Tier-info voor pricing-page. */
export interface TierDefinition {
  tier: BillingTier;
  label: string;
  /** "Voor wie?" — ééndelige tagline. */
  tagline: string;
  /** 1–2 zin beschrijving. */
  description: string;
  /** Maandelijkse prijs in EUR. `null` = bedrijfs-deal / op aanvraag. */
  monthlyPriceEur: number | null;
  /** Jaarlijkse prijs (vaak met korting); `null` = niet beschikbaar. */
  yearlyPriceEur: number | null;
  /** Sortering in pricing-page (links naar rechts). */
  sortOrder: number;
  /** Highlight-tier — krijgt visuele nadruk in de pricing-grid. */
  highlight?: boolean;
  /** CTA-label op de pricing-page. */
  ctaLabel: string;
}

/** Resultaat-shape van `canUseFeature`. */
export interface EntitlementCheck {
  /** Is feature beschikbaar voor de huidige tier? */
  allowed: boolean;
  /** Huidige tier van de user. */
  tier: BillingTier;
  /** Limit voor deze (allowed) feature, null = unlimited, undefined = N/A. */
  limit?: number | null;
  /** Welke tiers WEL toegang hebben — voor upgrade-CTA. */
  upgradeOptions: ReadonlyArray<BillingTier>;
  /** UI-label feature voor in een paywall-melding. */
  featureLabel: string;
  /** Lokale dev-override actief? Voor banner. */
  overrideActive?: boolean;
}
