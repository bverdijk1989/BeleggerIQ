/**
 * Daily AI Investment Briefing — types.
 *
 * **Filosofie**: de briefing voelt als een korte ochtend-memo van een
 * persoonlijke analist. Geen chatbot-vibe, geen marketing-taal. 7
 * vaste secties, hedged language, expliciete bronnen + onzekerheid.
 *
 * **Twee output-paden** met dezelfde shape:
 *  1. AI-pad: provider levert tekst, guardrails valideren, dan parsen.
 *  2. Fallback-pad: deterministische renderer bouwt dezelfde shape uit
 *     `BriefingContext` zonder LLM. UI ziet geen verschil behalve de
 *     `mode`-property.
 */

import type { ISODateString } from "@/types/common";

/** 7 verplichte secties uit de spec — deze volgorde is de UI-volgorde. */
export type BriefingSectionKey =
  | "portfolio_movement"
  | "winners_losers"
  | "risks"
  | "macro"
  | "earnings_news"
  | "concentration_volatility"
  | "focus_action";

export const BRIEFING_SECTION_ORDER: ReadonlyArray<BriefingSectionKey> = [
  "portfolio_movement",
  "winners_losers",
  "risks",
  "macro",
  "earnings_news",
  "concentration_volatility",
  "focus_action",
];

export const BRIEFING_SECTION_LABELS: Record<BriefingSectionKey, string> = {
  portfolio_movement: "Portefeuillebewegingen",
  winners_losers: "Grootste winnaars & verliezers",
  risks: "Relevante risico's",
  macro: "Macro-signalen",
  earnings_news: "Earnings & nieuws",
  concentration_volatility: "Concentratie & volatiliteit",
  focus_action: "Focuspunt voor vandaag",
};

export interface BriefingSection {
  key: BriefingSectionKey;
  /** UI-label NL. */
  label: string;
  /**
   * Eén korte alinea (1–3 zinnen) met hedged taal. Mag leeg zijn wanneer
   * onvoldoende data; in dat geval is `dataAvailable=false` + `body`
   * legt uit waarom.
   */
  body: string;
  /** False wanneer betrouwbare data ontbreekt (earnings/news vaak). */
  dataAvailable: boolean;
}

export type BriefingMode = "ai" | "fallback";
export type BriefingConfidence = "low" | "medium" | "high";

export interface DailyBriefing {
  portfolioId: string;
  /** Briefing-datum (YYYY-MM-DD) — komt 1× per dag uit cache. */
  briefingDate: string;
  generatedAt: ISODateString;

  /** "ai" als provider succesvol én guardrails passed; "fallback" anders. */
  mode: BriefingMode;
  /** Welke provider/model gebruikt is (audit-trail). */
  providerId: string;
  model: string;

  /** Eén-zin samenvatting (1e wat de gebruiker leest). */
  headline: string;
  /** 7 secties, in vaste volgorde. */
  sections: BriefingSection[];
  /** Eén concrete actie of aandachtspunt — duplicaat van section "focus_action" voor snelle access. */
  focusAction: string;
  /** "low"/"medium"/"high" — afgeleid uit data-coverage. */
  confidenceTier: BriefingConfidence;
  /** Lijst databronnen die gebruikt zijn (voor compliance + audit). */
  sources: string[];
  /** Lijst beperkingen (welke data ontbrak). */
  dataLimitations: string[];
  /** Disclaimer onderaan — vast template, NL. */
  disclaimer: string;
}

/**
 * Genormaliseerde input voor zowel AI-prompt als fallback-renderer.
 * Alles wat de briefing nodig heeft staat hier; de aggregator (`context.ts`)
 * leest dit uit `PortfolioView` + snapshots + regime + dashboard-actions.
 */
export interface BriefingContext {
  portfolioId: string;
  briefingDate: string;
  baseCurrency: string;

  /** Totale portefeuille-waarde + cash, snapshot van vandaag. */
  totals: {
    totalValue: number;
    cashBalance: number;
    cashShare: number;
    positionCount: number;
  };

  /** Day/week/month moves uit snapshots. Velden zijn null bij gebrek aan data. */
  movement: {
    /** % verandering t.o.v. vorige beschikbare snapshot. */
    dayChangePct: number | null;
    /** % verandering t.o.v. ~7 dagen geleden. */
    weekChangePct: number | null;
    /** % verandering t.o.v. ~30 dagen geleden. */
    monthChangePct: number | null;
    /** Totale unrealized P&L sinds aankoop, fractie. */
    sincePurchasePct: number | null;
  };

  /** Top 3 winnaars (sinds aankoop) + top 3 verliezers. */
  winnersLosers: {
    winners: BriefingPositionSnapshot[];
    losers: BriefingPositionSnapshot[];
  };

  /** Top risk-acties uit risk-engine (max 3). */
  risks: BriefingRiskSnapshot[];

  /** Markt-regime snapshot. */
  macro: BriefingMacroSnapshot | null;

  /** Concentratie- en volatiliteits-flags. */
  concentration: {
    largestPositionTicker: string | null;
    largestPositionWeight: number;
    /** Gewogen gemiddelde of grootste sector-share. */
    largestSectorLabel: string | null;
    largestSectorWeight: number | null;
    /** Geannualiseerde portefeuille-vol, fractie. */
    portfolioVolatility: number | null;
    /** Max-drawdown over historie, fractie 0..1. */
    maxDrawdown: number | null;
  };

  /** Top focus-actie uit dashboard-actions (mag null zijn). */
  focusAction: {
    title: string;
    description: string;
    confidence: number;
    sourceEngine: string;
  } | null;

  /** Earnings/news indicator — momenteel nooit beschikbaar; structuur klaar voor toekomstige feed. */
  earningsNews: {
    available: boolean;
    items: Array<{ ticker: string; headline: string; date: string }>;
  };

  /** Welke datasets gevuld waren (voor confidence + source-list). */
  dataSources: {
    snapshots: number;
    factorScored: number;
    regimeAvailable: boolean;
    riskActionsAvailable: number;
  };
}

export interface BriefingPositionSnapshot {
  ticker: string;
  name: string;
  /** Onrealised PnL fractie sinds aankoop. */
  pnlPct: number;
  /** Marktwaarde in base-currency. */
  marketValueBase: number;
  /** Gewicht in portefeuille 0..1. */
  weight: number;
}

export interface BriefingRiskSnapshot {
  /** Korte titel: "Concentratie ASML". */
  title: string;
  /** Severity-string uit risk-engine. */
  severity: string;
  /** 1-zin uitleg waarom dit risico telt. */
  impact: string;
  /** Actie uit rebalance/risk-mapper. */
  recommendedAction: string;
  /** 0..1. */
  confidence: number;
}

export interface BriefingMacroSnapshot {
  stance: string;
  score: number;
  confidence: number;
  /** Korte regime-narrative uit de regime-engine. */
  narrative: string;
}
