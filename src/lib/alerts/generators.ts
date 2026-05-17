/**
 * 10 alert-generators — pure functies.
 *
 * **Conventie**:
 *   - Input is alleen plain data (geen Prisma, geen netwerk, geen Date.now).
 *   - Output is `AlertCandidate[]` — service dedupt en persist.
 *   - `dedupeKey` is altijd `<TYPE>:<userId>:<bucket>:<salient>` zodat een
 *     dag/sample niet 6 alerts oplevert per cron-tick (idempotency).
 *   - Drempels staan inline als `const` — wijziging vereist een PR met
 *     motivatie.
 *
 * **Topbelegger-laag (Buffett)**: drempels zijn streng. Geen 1%-kruimels;
 * een price-move-alert vraagt ≥ 5% dag-beweging.
 */

import type { ISODateString } from "@/types/common";

import type {
  AlertCandidate,
  AlertSeverity,
} from "./types";

// ============================================================
//  Helpers
// ============================================================

const isoDay = (iso: string): string => iso.slice(0, 10);

function pct(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

function signedPct(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  const sign = fraction >= 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(digits)}%`;
}

function makeCandidate(input: AlertCandidate): AlertCandidate {
  return input;
}

// ============================================================
//  1. Health-drop
// ============================================================

const HEALTH_DROP_THRESHOLD = 5; // 5-punt daling triggert WARNING
const HEALTH_DROP_CRITICAL = 12; // 12-punt daling triggert CRITICAL
const HEALTH_BELOW_THRESHOLD = 50;

export interface HealthDropInput {
  userId: string;
  asOf: ISODateString;
  /** Health Score nu, 0..100. */
  current: number;
  /** Score op de vorige meting (typisch 24u eerder). */
  previous: number | null;
  /** Letter-grade nu — voor body-text. */
  currentGrade: string;
}

export function generateHealthDropAlerts(
  input: HealthDropInput,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  if (!Number.isFinite(input.current)) return out;
  const day = isoDay(input.asOf);

  // 1. Onder de "gezond"-drempel
  if (input.current < HEALTH_BELOW_THRESHOLD) {
    out.push(
      makeCandidate({
        type: "HEALTH_DROP",
        severity: "WARNING",
        dedupeKey: `HEALTH_DROP:${input.userId}:${day}:below-${HEALTH_BELOW_THRESHOLD}`,
        title: `Health Score onder ${HEALTH_BELOW_THRESHOLD}: ${Math.round(input.current)}/100`,
        body: `Je Portfolio Health Score is ${Math.round(input.current)} (${input.currentGrade}) — onder de drempel van ${HEALTH_BELOW_THRESHOLD}. Bekijk welke component(en) drukken op de score.`,
        link: "/portfolio-health",
        context: { score: input.current, threshold: HEALTH_BELOW_THRESHOLD },
        occurredAt: input.asOf,
      }),
    );
  }

  // 2. Forse daling t.o.v. vorige meting
  if (typeof input.previous === "number" && Number.isFinite(input.previous)) {
    const drop = input.previous - input.current;
    if (drop >= HEALTH_DROP_CRITICAL) {
      out.push(
        makeCandidate({
          type: "HEALTH_DROP",
          severity: "CRITICAL",
          dedupeKey: `HEALTH_DROP:${input.userId}:${day}:drop-${HEALTH_DROP_CRITICAL}`,
          title: `Health Score zakt fors: -${drop.toFixed(0)} punten`,
          body: `Score viel van ${Math.round(input.previous)} naar ${Math.round(input.current)} (${input.currentGrade}). Open /portfolio-health om te zien welke component(en) verzwakt zijn.`,
          link: "/portfolio-health",
          context: {
            scoreBefore: input.previous,
            scoreAfter: input.current,
            drop,
          },
          occurredAt: input.asOf,
        }),
      );
    } else if (drop >= HEALTH_DROP_THRESHOLD) {
      out.push(
        makeCandidate({
          type: "HEALTH_DROP",
          severity: "WARNING",
          dedupeKey: `HEALTH_DROP:${input.userId}:${day}:drop-${HEALTH_DROP_THRESHOLD}`,
          title: `Health Score zakt: -${drop.toFixed(0)} punten`,
          body: `Score viel van ${Math.round(input.previous)} naar ${Math.round(input.current)}. Bekijk welke component(en) onder druk staan.`,
          link: "/portfolio-health",
          context: { scoreBefore: input.previous, scoreAfter: input.current, drop },
          occurredAt: input.asOf,
        }),
      );
    }
  }
  return out;
}

// ============================================================
//  2. Concentration rising
// ============================================================

const CONCENTRATION_DELTA_TRIGGER = 0.03; // +3pt weight in 30d
const POSITION_HARD_THRESHOLD = 0.20; // 20% in één positie = WARNING
const POSITION_CRITICAL = 0.30; // 30% = CRITICAL
const SECTOR_HARD_THRESHOLD = 0.45; // 45% in één sector = WARNING

export interface ConcentrationRisingInput {
  userId: string;
  asOf: ISODateString;
  /** Posities met huidige + vorige weight. */
  positions: Array<{
    ticker: string;
    weight: number;
    previousWeight: number | null;
  }>;
  /** Sector-weights. */
  sectors: Array<{
    label: string;
    weight: number;
    previousWeight: number | null;
  }>;
}

export function generateConcentrationAlerts(
  input: ConcentrationRisingInput,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const day = isoDay(input.asOf);

  for (const pos of input.positions) {
    const delta =
      pos.previousWeight !== null && Number.isFinite(pos.previousWeight)
        ? pos.weight - pos.previousWeight
        : null;
    const overHard = pos.weight >= POSITION_HARD_THRESHOLD;
    const overCritical = pos.weight >= POSITION_CRITICAL;
    const rising = delta !== null && delta >= CONCENTRATION_DELTA_TRIGGER;
    if (!overHard && !rising) continue;
    const severity: AlertSeverity = overCritical
      ? "CRITICAL"
      : overHard
        ? "WARNING"
        : "INFO";
    const titleParts: string[] = [`${pos.ticker} ${pct(pos.weight)}`];
    if (delta !== null && delta >= CONCENTRATION_DELTA_TRIGGER) {
      titleParts.push(`(+${signedPct(delta)} sinds vorige meting)`);
    }
    out.push(
      makeCandidate({
        type: "CONCENTRATION_RISING",
        severity,
        dedupeKey: `CONCENTRATION_RISING:${input.userId}:${day}:position:${pos.ticker}`,
        title: titleParts.join(" "),
        body: `${pos.ticker} weegt nu ${pct(pos.weight)} van je portefeuille${delta !== null ? `, een toename van ${signedPct(delta)} t.o.v. de vorige meting` : ""}. Een grote single-name positie verhoogt het risico van één-bedrijf-nieuws.`,
        link: "/risico",
        context: {
          ticker: pos.ticker,
          weight: pos.weight,
          previousWeight: pos.previousWeight,
        },
        occurredAt: input.asOf,
      }),
    );
  }

  for (const sec of input.sectors) {
    const delta =
      sec.previousWeight !== null && Number.isFinite(sec.previousWeight)
        ? sec.weight - sec.previousWeight
        : null;
    const overHard = sec.weight >= SECTOR_HARD_THRESHOLD;
    const rising = delta !== null && delta >= CONCENTRATION_DELTA_TRIGGER;
    if (!overHard && !rising) continue;
    out.push(
      makeCandidate({
        type: "CONCENTRATION_RISING",
        severity: overHard ? "WARNING" : "INFO",
        dedupeKey: `CONCENTRATION_RISING:${input.userId}:${day}:sector:${sec.label}`,
        title: `Sector ${sec.label} ${pct(sec.weight)}`,
        body: `Sector ${sec.label} weegt ${pct(sec.weight)}${delta !== null ? ` (${signedPct(delta)} sinds vorige meting)` : ""}. Een sectorshock raakt al je posities tegelijk.`,
        link: "/risico",
        context: {
          sector: sec.label,
          weight: sec.weight,
          previousWeight: sec.previousWeight,
        },
        occurredAt: input.asOf,
      }),
    );
  }

  return out;
}

// ============================================================
//  3. Price-move
// ============================================================

const PRICE_MOVE_THRESHOLD = 0.05; // ±5% dag-beweging
const PRICE_MOVE_CRITICAL = 0.10; // ±10% = CRITICAL

export interface PriceMoveInput {
  userId: string;
  asOf: ISODateString;
  positions: Array<{
    ticker: string;
    name: string;
    /** Fractie t.o.v. vorige close, bv. 0.07 = +7%. */
    dayChange: number | null;
    /** Huidige weight in portefeuille — bepaalt of de move ertoe doet. */
    weight: number;
  }>;
}

export function generatePriceMoveAlerts(
  input: PriceMoveInput,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const day = isoDay(input.asOf);
  for (const pos of input.positions) {
    if (typeof pos.dayChange !== "number" || !Number.isFinite(pos.dayChange)) continue;
    const abs = Math.abs(pos.dayChange);
    if (abs < PRICE_MOVE_THRESHOLD) continue;
    // Skip irrelevante mini-posities (< 1% weight) bij niet-extreme moves.
    if (pos.weight < 0.01 && abs < PRICE_MOVE_CRITICAL) continue;
    const severity: AlertSeverity = abs >= PRICE_MOVE_CRITICAL ? "WARNING" : "INFO";
    const direction = pos.dayChange >= 0 ? "stijgt" : "daalt";
    out.push(
      makeCandidate({
        type: "PRICE_MOVE",
        severity,
        dedupeKey: `PRICE_MOVE:${input.userId}:${day}:${pos.ticker}`,
        title: `${pos.ticker} ${direction} ${signedPct(pos.dayChange)} vandaag`,
        body: `${pos.name} (${pct(pos.weight)} van je portefeuille) ${direction} ${signedPct(pos.dayChange)} vandaag. Bekijk of de move bij je thesis past — geen reden tot paniek-handelen.`,
        link: "/portfolio",
        context: {
          ticker: pos.ticker,
          dayChange: pos.dayChange,
          weight: pos.weight,
        },
        occurredAt: input.asOf,
      }),
    );
  }
  return out;
}

// ============================================================
//  4. Macro regime change
// ============================================================

export interface MacroRegimeChangeInput {
  userId: string;
  asOf: ISODateString;
  /** Vorig regime. */
  previous:
    | "GOLDILOCKS"
    | "REFLATION"
    | "STAGFLATION"
    | "DEFLATION"
    | "TRANSITIONAL"
    | null;
  /** Huidig regime. */
  current:
    | "GOLDILOCKS"
    | "REFLATION"
    | "STAGFLATION"
    | "DEFLATION"
    | "TRANSITIONAL";
}

export function generateMacroRegimeChangeAlerts(
  input: MacroRegimeChangeInput,
): AlertCandidate[] {
  if (
    input.previous === null ||
    input.previous === input.current ||
    input.previous === "TRANSITIONAL" ||
    input.current === "TRANSITIONAL"
  ) {
    // Geen alert bij eerste meting, geen wissel, of overgangsperiodes.
    return [];
  }
  const day = isoDay(input.asOf);
  return [
    makeCandidate({
      type: "MACRO_REGIME_CHANGE",
      severity: "WARNING",
      dedupeKey: `MACRO_REGIME_CHANGE:${input.userId}:${day}:${input.previous}-${input.current}`,
      title: `Macroregime: ${input.previous} → ${input.current}`,
      body: `Het regime-model schakelt van ${input.previous.toLowerCase()} naar ${input.current.toLowerCase()}. Bekijk op /macro welke asset-classes nu rugwind of tegenwind krijgen.`,
      link: "/macro",
      context: { regimeBefore: input.previous, regimeAfter: input.current },
      occurredAt: input.asOf,
    }),
  ];
}

// ============================================================
//  5. Behavioral warning
// ============================================================

export interface BehavioralWarningInput {
  userId: string;
  asOf: ISODateString;
  signals: Array<{
    id: string;
    title: string;
    severity: "low" | "moderate" | "elevated" | "high";
    /** Eerder bekend? Skip wanneer al bekend (geen herhalings-spam). */
    isNew: boolean;
  }>;
}

const BEHAVIORAL_SEVERITY_MAP: Record<
  "low" | "moderate" | "elevated" | "high",
  AlertSeverity
> = {
  low: "INFO",
  moderate: "INFO",
  elevated: "WARNING",
  high: "CRITICAL",
};

export function generateBehavioralAlerts(
  input: BehavioralWarningInput,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const s of input.signals) {
    if (!s.isNew) continue;
    if (s.severity === "low") continue; // alleen moderate+ wek je een alert
    out.push(
      makeCandidate({
        type: "BEHAVIORAL_WARNING",
        severity: BEHAVIORAL_SEVERITY_MAP[s.severity],
        dedupeKey: `BEHAVIORAL_WARNING:${input.userId}:${s.id}`,
        title: s.title,
        body: `De Behavioral Coach detecteert dit patroon. Het is geen veroordeling — wel een uitnodiging om bewust te blijven handelen.`,
        link: "/coach",
        context: { signalId: s.id, severity: s.severity },
        occurredAt: input.asOf,
      }),
    );
  }
  return out;
}

// ============================================================
//  6. Earnings event (stub — vereist externe feed)
// ============================================================

export interface EarningsEventInput {
  userId: string;
  asOf: ISODateString;
  /** Earnings-feed levert events; lege array = niets aangesloten. */
  events: Array<{
    ticker: string;
    name: string;
    /** ISO-datum van de earnings-publicatie. */
    earningsDate: string;
  }>;
}

export function generateEarningsEventAlerts(
  input: EarningsEventInput,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const e of input.events) {
    const day = isoDay(input.asOf);
    out.push(
      makeCandidate({
        type: "EARNINGS_EVENT",
        severity: "INFO",
        dedupeKey: `EARNINGS_EVENT:${input.userId}:${day}:${e.ticker}:${e.earningsDate}`,
        title: `${e.ticker} earnings op ${e.earningsDate.slice(0, 10)}`,
        body: `${e.name} publiceert kwartaalcijfers. Korte-termijn-volatiliteit is normaal — focus op de lange-termijn-trends in winst en marges.`,
        link: "/portfolio",
        context: {
          ticker: e.ticker,
          earningsDate: e.earningsDate,
        },
        occurredAt: input.asOf,
      }),
    );
  }
  return out;
}

// ============================================================
//  7. Dividend event
// ============================================================

export interface DividendEventInput {
  userId: string;
  asOf: ISODateString;
  events: Array<{
    ticker: string;
    name: string;
    /** Ex-dividend-datum. */
    exDate: string;
    /** Bedrag per aandeel in lokale currency. */
    amount: number | null;
    currency: string | null;
  }>;
}

export function generateDividendEventAlerts(
  input: DividendEventInput,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const e of input.events) {
    const day = isoDay(input.asOf);
    const amountText =
      e.amount !== null && e.currency !== null
        ? `${e.amount.toFixed(2)} ${e.currency} per aandeel`
        : "dividend";
    out.push(
      makeCandidate({
        type: "DIVIDEND_EVENT",
        severity: "INFO",
        dedupeKey: `DIVIDEND_EVENT:${input.userId}:${day}:${e.ticker}:${e.exDate}`,
        title: `${e.ticker} ex-dividend op ${e.exDate.slice(0, 10)}`,
        body: `${e.name} keert ${amountText} uit. Hou je aandelen vóór ex-datum om recht te hebben op dividend.`,
        link: "/portfolio",
        context: {
          ticker: e.ticker,
          exDate: e.exDate,
          amount: e.amount,
          currency: e.currency,
        },
        occurredAt: input.asOf,
      }),
    );
  }
  return out;
}

// ============================================================
//  8. Watchlist opportunity
// ============================================================

export interface WatchlistOpportunityInput {
  userId: string;
  asOf: ISODateString;
  hits: Array<{
    ticker: string;
    name: string;
    currentPrice: number;
    targetPrice: number;
    direction: "BELOW" | "ABOVE";
    currency: string | null;
  }>;
}

export function generateWatchlistAlerts(
  input: WatchlistOpportunityInput,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const day = isoDay(input.asOf);
  for (const h of input.hits) {
    out.push(
      makeCandidate({
        type: "WATCHLIST_OPPORTUNITY",
        severity: "INFO",
        dedupeKey: `WATCHLIST_OPPORTUNITY:${input.userId}:${day}:${h.ticker}:${h.direction}:${h.targetPrice}`,
        title: `${h.ticker} in koop-zone (${h.direction === "BELOW" ? "≤" : "≥"} ${h.targetPrice}${h.currency ? ` ${h.currency}` : ""})`,
        body: `${h.name} staat op ${h.currentPrice}${h.currency ? ` ${h.currency}` : ""} — ${h.direction === "BELOW" ? "onder" : "boven"} je drempel van ${h.targetPrice}${h.currency ? ` ${h.currency}` : ""}. Tijd om je thesis te checken.`,
        link: "/watchlist",
        context: {
          ticker: h.ticker,
          currentPrice: h.currentPrice,
          targetPrice: h.targetPrice,
          direction: h.direction,
        },
        occurredAt: input.asOf,
      }),
    );
  }
  return out;
}

// ============================================================
//  8b. Watchlist intelligence (Module 9) — signaal-gedreven alerts
// ============================================================

/**
 * Een vereenvoudigde view van een `WatchlistIntelligenceReport` —
 * we vermijden een runtime-dependency op @/lib/watchlist-intelligence
 * en accepteren een plain shape (deze generator is pure functie).
 */
export interface WatchlistIntelligenceHit {
  ticker: string;
  name: string;
  tier: "STRONG_OPPORTUNITY" | "POSITIVE" | "NEUTRAL" | "WAIT";
  /** De sterkste positieve signaal (label + strength + rationale). */
  topPositive: {
    label: string;
    rationale: string;
    strength: number;
  } | null;
  /** De sterkste negatieve signaal (voor mixed-tier-alerts). */
  topNegative: {
    label: string;
    rationale: string;
    strength: number;
  } | null;
}

export interface WatchlistIntelligenceAlertInput {
  userId: string;
  asOf: ISODateString;
  hits: ReadonlyArray<WatchlistIntelligenceHit>;
}

/**
 * Module 9: signaal-gedreven watchlist alerts. Anders dan
 * `generateWatchlistAlerts` (die op prijs-thresholds tikt) reageert
 * deze generator op intelligence-tier-shifts: STRONG_OPPORTUNITY
 * triggert een alert, en mixed-tiers met een sterk negatief signaal
 * geven een attentie-alert ("kansrijk maar kwetsbaar").
 */
const STRENGTH_TRIGGER = 60;

export function generateWatchlistIntelligenceAlerts(
  input: WatchlistIntelligenceAlertInput,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const day = isoDay(input.asOf);
  for (const h of input.hits) {
    if (h.tier === "STRONG_OPPORTUNITY" && h.topPositive) {
      out.push(
        makeCandidate({
          type: "WATCHLIST_OPPORTUNITY",
          severity: "INFO",
          dedupeKey: `WATCHLIST_INTEL:${input.userId}:${day}:${h.ticker}:STRONG`,
          title: `${h.ticker}: sterke kans — ${h.topPositive.label.toLowerCase()}`,
          body: `${h.name}: ${h.topPositive.rationale} Check de volledige breakdown op /watchlist voordat je iets doet — een meting is geen koopsignaal.`,
          link: "/watchlist",
          context: {
            ticker: h.ticker,
            tier: h.tier,
            topSignal: h.topPositive.label,
          },
          occurredAt: input.asOf,
        }),
      );
      continue;
    }
    // Mixed: sterke positief signal + sterke negatief signal = aandacht-alert.
    if (
      h.topPositive &&
      h.topNegative &&
      h.topPositive.strength >= STRENGTH_TRIGGER &&
      h.topNegative.strength >= STRENGTH_TRIGGER
    ) {
      out.push(
        makeCandidate({
          type: "WATCHLIST_OPPORTUNITY",
          severity: "INFO",
          dedupeKey: `WATCHLIST_INTEL:${input.userId}:${day}:${h.ticker}:MIXED`,
          title: `${h.ticker}: gemengd beeld — kans + risico`,
          body: `Plus: ${h.topPositive.rationale} Min: ${h.topNegative.rationale} Beoordeel zelf of dit bij je horizon en risicoprofiel past.`,
          link: "/watchlist",
          context: {
            ticker: h.ticker,
            tier: h.tier,
            positive: h.topPositive.label,
            negative: h.topNegative.label,
          },
          occurredAt: input.asOf,
        }),
      );
    }
  }
  return out;
}

// ============================================================
//  9. Valuation signal
// ============================================================

const FCF_YIELD_THRESHOLD = 0.07; // ≥ 7% FCF yield = aantrekkelijk
const PE_LOW_PERCENTILE = 30; // value sub-score ≥ 70 = goedkope kant
const VALUE_SUBSCORE_THRESHOLD = 70;

export interface ValuationSignalInput {
  userId: string;
  asOf: ISODateString;
  positions: Array<{
    ticker: string;
    name: string;
    /** 0..100 value sub-score uit factor-engine. */
    valueSubScore: number | null;
    /** FCF yield als fractie. */
    fcfYield: number | null;
  }>;
}

export function generateValuationSignalAlerts(
  input: ValuationSignalInput,
): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const day = isoDay(input.asOf);
  for (const pos of input.positions) {
    const valueOk =
      typeof pos.valueSubScore === "number" &&
      pos.valueSubScore >= VALUE_SUBSCORE_THRESHOLD;
    const fcfOk =
      typeof pos.fcfYield === "number" && pos.fcfYield >= FCF_YIELD_THRESHOLD;
    if (!valueOk && !fcfOk) continue;
    const detailParts: string[] = [];
    if (valueOk && pos.valueSubScore !== null) {
      detailParts.push(`value-score ${Math.round(pos.valueSubScore)}/100`);
    }
    if (fcfOk && pos.fcfYield !== null) {
      detailParts.push(`FCF-yield ${pct(pos.fcfYield)}`);
    }
    out.push(
      makeCandidate({
        type: "VALUATION_SIGNAL",
        severity: "INFO",
        dedupeKey: `VALUATION_SIGNAL:${input.userId}:${day}:${pos.ticker}`,
        title: `${pos.ticker}: aantrekkelijke waardering`,
        body: `${pos.name} scoort gunstig op waardering (${detailParts.join(", ")}). Niet automatisch een koopsignaal — controleer fundamentals + thesis.`,
        link: `/score/${encodeURIComponent(pos.ticker)}`,
        context: {
          ticker: pos.ticker,
          valueSubScore: pos.valueSubScore,
          fcfYield: pos.fcfYield,
        },
        occurredAt: input.asOf,
      }),
    );
    // Markowitz-floor: max 5 valuation-alerts per dag — Buffett-laag.
    if (out.length >= 5) break;
  }
  return out;
}

// ============================================================
//  10. AI briefing ready
// ============================================================

export interface AiBriefingReadyInput {
  userId: string;
  asOf: ISODateString;
  /** Briefing-datum (YYYY-MM-DD) — een briefing per dag. */
  briefingDate: string;
  /** Headline-zin uit de briefing voor preview. */
  headline: string;
  /** AI of fallback? Voor audit. */
  mode: "ai" | "fallback";
}

export function generateAiBriefingReadyAlerts(
  input: AiBriefingReadyInput,
): AlertCandidate[] {
  return [
    makeCandidate({
      type: "AI_BRIEFING_READY",
      severity: "INFO",
      dedupeKey: `AI_BRIEFING_READY:${input.userId}:${input.briefingDate}`,
      title: `Dagelijkse briefing van ${input.briefingDate} is klaar`,
      body: input.headline,
      link: "/briefing",
      context: { briefingDate: input.briefingDate, mode: input.mode },
      occurredAt: input.asOf,
    }),
  ];
}
