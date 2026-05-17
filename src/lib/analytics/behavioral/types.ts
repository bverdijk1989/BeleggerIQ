/**
 * Behavioral Finance Coach — types.
 *
 * 8 gedragspatronen, expliciet meetbaar (Simons-laag) en uitlegbaar
 * (Lynch-laag). Elke detectie produceert een `BehavioralSignal` met:
 *  - kortgesneden coachende boodschap (geen veroordeling)
 *  - reflectievragen (Buffett-laag — pauzeer voor je handelt)
 *  - severity (Dalio-laag — risico expliciet)
 *  - meetwaarde + drempel (audit + transparantie)
 *
 * **Toon-conventie**: GEEN "je hebt fout gehandeld". WEL "je portefeuille
 * wijkt af van je strategie — wil je deze keuze bewust maken?".
 */

import type { ISODateString } from "@/types/common";

/** 10 gedragspatronen die we detecteren (Module 3 spec-aligned). */
export type BehavioralSignalKey =
  | "OVERCONCENTRATION"
  | "OVERTRADING"
  | "PANIC_SELLING"
  | "FOMO_BUYING"
  | "STRATEGY_DRIFT"
  | "UNDER_DIVERSIFICATION"
  | "CASH_MISMATCH"
  | "PERFORMANCE_CHASING"
  | "VOLATILITY_MISMATCH"
  | "SPECULATIVE_OVERALLOCATION";

/** Severity-tiers (consistent met risk-engine voor UI-kleur reuse). */
export type BehavioralSeverity = "low" | "moderate" | "elevated" | "high";

/**
 * UI-triad: Module 3 spec eist `info`/`warning`/`critical`. We mappen
 * onze 4-stap interne severity hierop voor coaching-cards. Mapping:
 *  - `low` → `info`
 *  - `moderate` → `warning`
 *  - `elevated`/`high` → `critical`
 *
 * Pure functie, idempotent, geen state.
 */
export type BehavioralUiSeverity = "info" | "warning" | "critical";

export function toUiSeverity(
  severity: BehavioralSeverity,
): BehavioralUiSeverity {
  if (severity === "low") return "info";
  if (severity === "moderate") return "warning";
  return "critical";
}

/** Status: actief tonen, gebruiker negeerde 'em, of snooze tot datum. */
export type BehavioralStatus = "ACTIVE" | "DISMISSED" | "SNOOZED";

export interface BehavioralReflectionQuestion {
  /** Stabiele key voor analytics ("CONCENTRATION_DROP_30"). */
  key: string;
  /** Vraag in NL. */
  question: string;
  /** Optionele toelichting / hint onder de vraag. */
  hint?: string;
}

/**
 * Eén gedetecteerd gedrags-signaal. Geen UI-state hier; het filter +
 * status (ACTIVE / DISMISSED / SNOOZED) zit los in het state-record.
 */
export interface BehavioralSignal {
  /**
   * Stabiele identifier per (signal-type, target). Wordt gebruikt voor
   * dismiss/snooze-state en voor dedup. Voorbeelden:
   *   "OVERCONCENTRATION:ASML"
   *   "OVERTRADING:GLOBAL"
   *   "PANIC_SELLING:ASML:2026-05-08"
   */
  id: string;
  key: BehavioralSignalKey;
  severity: BehavioralSeverity;
  /** UI-titel — coachend, niet betuttelend. */
  title: string;
  /** Coachende uitleg (1–3 zinnen) — wat is gemeten + waarom telt het. */
  message: string;
  /** Numerieke meetwaarde (bv. position-weight 0.18). */
  metric: number | null;
  /** Drempel waarboven het signaal afgaat. */
  threshold: number | null;
  /** 1–3 reflectievragen voor de gebruiker. */
  reflectionQuestions: BehavioralReflectionQuestion[];
  /** Optioneel: ticker waarop het signaal slaat. */
  ticker?: string;
  /** Optioneel: korte volgende-actie tip (geen koop/verkoop-advies). */
  nextStep?: string;
  /**
   * Engine-ID(s) die de input leverden — voor traceability ("transactions"
   * + "portfolio-view").
   */
  sourceEngines: string[];
  /** Wanneer dit signaal gegenereerd is. */
  detectedAt: ISODateString;
}

/** State-record per (user, signalId) — uit de DB, optioneel afwezig. */
export interface BehavioralWarningState {
  userId: string;
  signalId: string;
  status: BehavioralStatus;
  /** Voor SNOOZED — datum waarna het signaal weer ACTIVE wordt. */
  snoozedUntil: Date | null;
  /** Optionele user-notitie ("ik handel deze zelf in juni"). */
  reasonNote: string | null;
  updatedAt: Date;
  createdAt: Date;
}

/**
 * Een signaal samen met zijn state — wat de UI uiteindelijk consumeert.
 */
export interface BehavioralSignalWithState extends BehavioralSignal {
  state: BehavioralWarningState | null;
  /** Effectieve status na state-merge: ACTIVE / DISMISSED / SNOOZED. */
  effectiveStatus: BehavioralStatus;
}

/**
 * Result-shape van de hoofd-engine.
 */
export interface BehavioralReport {
  portfolioId: string;
  detectedAt: ISODateString;
  /** Alle signalen, ge-sort op severity desc. */
  signals: BehavioralSignal[];
  /** Tellingen per severity (voor dashboard-stats). */
  counts: Record<BehavioralSeverity, number>;
  /** Welke detectoren konden niet draaien (geen data). */
  skippedDetectors: Array<{ key: BehavioralSignalKey; reason: string }>;
}

/** UI-labels (NL). */
export const BEHAVIORAL_LABELS: Record<BehavioralSignalKey, string> = {
  OVERCONCENTRATION: "Overconcentratie",
  OVERTRADING: "Veel transacties",
  PANIC_SELLING: "Verkoop na daling",
  FOMO_BUYING: "Aankoop na sterke stijging",
  STRATEGY_DRIFT: "Afwijking van strategie",
  UNDER_DIVERSIFICATION: "Beperkte spreiding",
  CASH_MISMATCH: "Cash-balans uit balans",
  PERFORMANCE_CHASING: "Performance chasing",
  VOLATILITY_MISMATCH: "Volatiliteit boven je profiel",
  SPECULATIVE_OVERALLOCATION: "Speculatieve overallocatie",
};

export const BEHAVIORAL_SEVERITY_RANK: Record<BehavioralSeverity, number> = {
  low: 1,
  moderate: 2,
  elevated: 3,
  high: 4,
};
