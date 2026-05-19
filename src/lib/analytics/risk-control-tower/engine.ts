/**
 * Risk Control Tower — pure-function engine (Module 29).
 *
 * Aggreggert 12 categorieën uit bestaande engines naar één Control Tower.
 * Pure functie: zelfde input → zelfde output. Geen I/O.
 *
 * **Severity-classificatie**:
 *  - score 0–34 → green
 *  - score 35–66 → orange
 *  - score 67–100 → red
 *  - geen data → gray (apart, niet "veilig")
 *
 * **Risk-budget**: utilisatie van risico-punten relatief tot max.
 *  < 40% → green; 40-70% → orange; > 70% → red.
 */

import type { ISODateString } from "@/types/common";

import {
  RISK_CATEGORY_LABELS,
  RISK_CONTROL_TOWER_DISCLAIMER,
  type RiskBudget,
  type RiskCategoryKey,
  type RiskCategoryReport,
  type RiskControlTowerReport,
  type RiskSeverityTone,
} from "./types";

/**
 * Inputs voor de engine. Caller (loader) hydrateert deze velden vanuit
 * bestaande bronnen. Alle velden zijn optioneel — ontbrekende data
 * leidt tot `severity: "gray"` in die categorie.
 */
export interface BuildRiskControlTowerInput {
  generatedAt: ISODateString;

  // --- Concentratie / sector / regio / currency ---
  /** Grootste positie-weight 0..1. */
  largestPositionWeight?: number | null;
  largestPositionTicker?: string | null;
  /** Top-5 weight 0..1. */
  top5Weight?: number | null;
  /** HHI op positie-gewichten 0..1. */
  concentrationHhi?: number | null;
  /** Aantal posities. */
  positionCount?: number | null;

  topSector?: { label: string; weight: number } | null;
  /** HHI sector-gewichten 0..1. */
  sectorConcentrationHhi?: number | null;

  topRegion?: { label: string; weight: number } | null;
  /** HHI regio-gewichten 0..1. */
  regionConcentrationHhi?: number | null;

  /** Niet-base-currency exposure 0..1. */
  foreignCurrencyExposure?: number | null;

  // --- Rente / Macro ---
  /** 10y rente fractie (0.045 = 4.5%). */
  interestRate10y?: number | null;
  /** Δ 10y rente 1y in procentpunten. */
  rateChange1y?: number | null;
  /** Yield-curve slope 10y-2y in procentpunten. */
  yieldCurveSlope?: number | null;
  /** 0..100 macro-regime alignment (hoger = beter aligned). */
  regimeAlignmentScore?: number | null;
  /** Regime-stance. */
  regimeStance?: "RISK_ON" | "NEUTRAL" | "DEFENSIVE" | null;

  // --- Drawdown / Volatility ---
  /** Max historische drawdown (negatief fractie). */
  maxDrawdown?: number | null;
  /** 95% VaR fractie. */
  valueAtRisk95?: number | null;
  /** Geannualiseerde vola 0..1. */
  portfolioVolatility?: number | null;

  // --- Liquiditeit ---
  /**
   * Aandeel van portefeuille (0..1) met `liquidityScore < 0.5` of
   * onbekend. Hoger = meer illiquide exposure.
   */
  illiquidWeight?: number | null;

  // --- Data quality ---
  /**
   * Data-depth weighted score 0..100 (M26). Lager = meer data-risico.
   */
  dataDepthScore?: number | null;

  // --- Crypto / speculation ---
  /** Aandeel CRYPTO in portfolio (0..1). */
  cryptoWeight?: number | null;
  /** Speculative-flagged weight (M12 + classification.isSpeculative). */
  speculativeWeight?: number | null;

  // --- Behavioral ---
  /** Aantal active behavioral-signals. */
  behavioralActiveCount?: number | null;
  /** Aantal signals met severity high/elevated. */
  behavioralHighCount?: number | null;
}

/**
 * Hoofd-aggregator.
 */
export function buildRiskControlTowerReport(
  input: BuildRiskControlTowerInput,
): RiskControlTowerReport {
  const categories: RiskCategoryReport[] = [
    buildConcentration(input),
    buildSector(input),
    buildRegion(input),
    buildCurrency(input),
    buildInterestRate(input),
    buildMacroRegime(input),
    buildDrawdown(input),
    buildVolatility(input),
    buildLiquidity(input),
    buildDataQuality(input),
    buildCryptoSpeculation(input),
    buildBehavioral(input),
  ];

  const counts: Record<RiskSeverityTone, number> = {
    green: 0,
    orange: 0,
    red: 0,
    gray: 0,
  };
  for (const c of categories) {
    counts[c.severity] += 1;
  }

  const budget = computeRiskBudget(categories);
  const headline = buildHeadline(counts, budget);

  return {
    generatedAt: input.generatedAt,
    categories,
    budget,
    counts,
    headline,
    disclaimer: RISK_CONTROL_TOWER_DISCLAIMER,
  };
}

// ============================================================
//  Severity-mapping
// ============================================================

function severityFromScore(score: number | null): RiskSeverityTone {
  if (score === null || !Number.isFinite(score)) return "gray";
  if (score >= 67) return "red";
  if (score >= 35) return "orange";
  return "green";
}

/**
 * Score uit een waarde gegeven low/high thresholds (hoger = meer risico).
 * Onder low → 15, boven high → 85, daartussen lineair.
 */
function scoreFromThreshold(
  value: number | null | undefined,
  low: number,
  high: number,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= low) return 15;
  if (value >= high) return 85;
  return Math.round(15 + ((value - low) / (high - low)) * 70);
}

/** Inverse — hogere waarde = lager risico. */
function scoreFromThresholdInverse(
  value: number | null | undefined,
  low: number,
  high: number,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= high) return 15;
  if (value <= low) return 85;
  return Math.round(85 - ((value - low) / (high - low)) * 70);
}

// ============================================================
//  12 categorieën — pure builders
// ============================================================

function buildConcentration(
  input: BuildRiskControlTowerInput,
): RiskCategoryReport {
  // Combineer largestPositionWeight + top5Weight + HHI tot één score.
  const lpw = input.largestPositionWeight ?? null;
  const t5 = input.top5Weight ?? null;
  const hhi = input.concentrationHhi ?? null;

  const lpwScore = scoreFromThreshold(lpw, 0.05, 0.15);
  const t5Score = scoreFromThreshold(t5, 0.4, 0.7);
  const hhiScore = scoreFromThreshold(hhi, 0.1, 0.25);

  const scores = [lpwScore, t5Score, hhiScore].filter(
    (s): s is number => s !== null,
  );
  const score = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : null;

  const severity = severityFromScore(score);
  const lpwPct = lpw !== null ? `${Math.round(lpw * 100)}%` : "—";
  const headline =
    input.largestPositionTicker && lpw !== null
      ? `Grootste positie: ${input.largestPositionTicker} ${lpwPct}`
      : `Concentratie HHI ${hhi !== null ? (hhi * 100).toFixed(0) + "%" : "—"}`;

  return {
    key: "concentration",
    label: RISK_CATEGORY_LABELS.concentration,
    severity,
    score,
    headlineMetric: headline,
    explanation:
      severity === "red"
        ? "Eén of meer posities domineren de portefeuille — bij een verlies tikt dat hard door."
        : severity === "orange"
          ? "Top-posities hebben verhoogde weging. Bewust gemaakt? Anders overweeg bredere spreiding."
          : severity === "gray"
            ? "Onvoldoende data voor concentratie-meting."
            : "Posities zijn evenwichtig verdeeld — diversificatie is op orde.",
    actionSuggestion:
      severity === "red"
        ? "Overweeg te trimmen of bewust extra diversifiers toe te voegen."
        : severity === "orange"
          ? "Controleer of de top-3 posities aansluit bij je convictie."
          : "Geen actie nodig.",
    source: "risk-engine",
    metric: lpw,
    threshold: 0.15,
  };
}

function buildSector(input: BuildRiskControlTowerInput): RiskCategoryReport {
  const top = input.topSector;
  const hhi = input.sectorConcentrationHhi ?? null;

  const topScore = top ? scoreFromThreshold(top.weight, 0.3, 0.5) : null;
  const hhiScore = scoreFromThreshold(hhi, 0.2, 0.45);
  const scores = [topScore, hhiScore].filter(
    (s): s is number => s !== null,
  );
  const score = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : null;

  const severity = severityFromScore(score);
  const headline = top
    ? `${top.label} ${Math.round(top.weight * 100)}%`
    : "—";

  return {
    key: "sector",
    label: RISK_CATEGORY_LABELS.sector,
    severity,
    score,
    headlineMetric: headline,
    explanation:
      severity === "red"
        ? "Eén sector domineert — sector-shocks (regulering, rente) raken je portfolio direct."
        : severity === "orange"
          ? "Sectorconcentratie is verhoogd. Mogelijk een actieve keuze — check of het past."
          : severity === "gray"
            ? "Sector-data ontbreekt voor te veel posities."
            : "Sectoren zijn redelijk verdeeld.",
    actionSuggestion:
      severity === "red"
        ? "Overweeg een positie in een andere sector om een sector-only-shock af te dempen."
        : severity === "orange"
          ? "Houd sector-news in de gaten; weeg de exposure tegen je conviction-niveau."
          : "Geen actie nodig.",
    source: "risk-engine",
    metric: top?.weight ?? null,
    threshold: 0.5,
  };
}

function buildRegion(input: BuildRiskControlTowerInput): RiskCategoryReport {
  const top = input.topRegion;
  const hhi = input.regionConcentrationHhi ?? null;

  const topScore = top ? scoreFromThreshold(top.weight, 0.5, 0.8) : null;
  const hhiScore = scoreFromThreshold(hhi, 0.3, 0.6);
  const scores = [topScore, hhiScore].filter(
    (s): s is number => s !== null,
  );
  const score = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : null;

  const severity = severityFromScore(score);

  return {
    key: "region",
    label: RISK_CATEGORY_LABELS.region,
    severity,
    score,
    headlineMetric: top
      ? `${top.label} ${Math.round(top.weight * 100)}%`
      : "—",
    explanation:
      severity === "red"
        ? "Zware regio-bias — politieke of monetaire schokken in deze regio tikken hard door."
        : severity === "orange"
          ? "Regio-exposure is licht eenzijdig; bewust gekozen of opportunistic?"
          : severity === "gray"
            ? "Regio-data ontbreekt voor te veel posities."
            : "Geografische spreiding is redelijk.",
    actionSuggestion:
      severity === "red"
        ? "Overweeg posities buiten je huidige hoofdregio voor diversificatie."
        : severity === "orange"
          ? "Volg regio-specifieke macro-events alert."
          : "Geen actie nodig.",
    source: "risk-engine",
    metric: top?.weight ?? null,
    threshold: 0.8,
  };
}

function buildCurrency(input: BuildRiskControlTowerInput): RiskCategoryReport {
  const fx = input.foreignCurrencyExposure ?? null;
  const score = scoreFromThreshold(fx, 0.3, 0.7);
  const severity = severityFromScore(score);

  return {
    key: "currency",
    label: RISK_CATEGORY_LABELS.currency,
    severity,
    score,
    headlineMetric:
      fx !== null ? `${Math.round(fx * 100)}% niet-base` : "—",
    explanation:
      severity === "red"
        ? "Grote vreemde-valuta-exposure — FX-bewegingen domineren je rendement."
        : severity === "orange"
          ? "Vreemde-valuta-aandeel is verhoogd; FX-bewegingen tikken merkbaar door."
          : severity === "gray"
            ? "Valuta-data ontbreekt."
            : "Beperkte valuta-blootstelling — FX heeft kleine impact.",
    actionSuggestion:
      severity === "red"
        ? "Overweeg een EUR-hedged-equivalent voor de grootste FX-positie."
        : severity === "orange"
          ? "Houd EUR/USD- en EUR/GBP-context in de gaten."
          : "Geen actie nodig.",
    source: "risk-engine",
    metric: fx,
    threshold: 0.7,
  };
}

function buildInterestRate(
  input: BuildRiskControlTowerInput,
): RiskCategoryReport {
  // Combineer rente-niveau + recente snelle stijging als risico-indicator.
  const r = input.interestRate10y ?? null;
  const dy = input.rateChange1y ?? null;
  const slope = input.yieldCurveSlope ?? null;

  const rScore = scoreFromThreshold(r, 0.025, 0.06);
  // Snelle stijging > 1pp/jaar verhoogt risico.
  const dyScore = scoreFromThreshold(dy, 0.005, 0.02);
  // Inverse yield-curve (slope ≤ 0) is recessie-signaal.
  const slopeScore =
    slope !== null && Number.isFinite(slope)
      ? slope <= -0.005
        ? 85
        : slope <= 0
          ? 70
          : slope <= 0.01
            ? 55
            : 30
      : null;
  const scores = [rScore, dyScore, slopeScore].filter(
    (s): s is number => s !== null,
  );
  const score = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : null;

  const severity = severityFromScore(score);

  return {
    key: "interest_rate",
    label: RISK_CATEGORY_LABELS.interest_rate,
    severity,
    score,
    headlineMetric:
      r !== null
        ? `10y ${(r * 100).toFixed(1)}%`
        : "—",
    explanation:
      severity === "red"
        ? "Restrictief rente-klimaat met mogelijke recessie-signalen — equity-multiples staan onder druk."
        : severity === "orange"
          ? "Renteniveau is verhoogd; let op rate-sensitive posities (REITs, langere-duration)."
          : severity === "gray"
            ? "Geen recente rentedata beschikbaar."
            : "Rente-omgeving is supportief.",
    actionSuggestion:
      severity === "red"
        ? "Controleer of je obligaties/REIT-exposure aansluit bij dit rente-regime."
        : severity === "orange"
          ? "Volg ECB/Fed-statements; reken op aanhoudende volatiliteit in rates."
          : "Geen actie nodig.",
    source: "macro-regime",
    metric: r,
    threshold: 0.06,
  };
}

function buildMacroRegime(
  input: BuildRiskControlTowerInput,
): RiskCategoryReport {
  const alignment = input.regimeAlignmentScore ?? null;
  const stance = input.regimeStance ?? null;

  // alignment is 0..100, hoger = beter aligned (lager risico).
  const score = scoreFromThresholdInverse(alignment, 40, 75);
  const severity = severityFromScore(score);

  return {
    key: "macro_regime",
    label: RISK_CATEGORY_LABELS.macro_regime,
    severity,
    score,
    headlineMetric:
      alignment !== null
        ? `Alignment ${Math.round(alignment)}/100${stance ? ` · ${stance}` : ""}`
        : "—",
    explanation:
      severity === "red"
        ? "Portfolio ligt slecht in lijn met het huidige macro-regime — verhoogde tegenwind."
        : severity === "orange"
          ? "Macro-alignment is suboptimaal. Niet alarmerend, wel iets om te volgen."
          : severity === "gray"
            ? "Geen regime-data beschikbaar voor alignment-meting."
            : "Portfolio sluit goed aan bij het huidige macro-regime.",
    actionSuggestion:
      severity === "red"
        ? "Overweeg defensieve sectoren of cash-buffer te verhogen."
        : severity === "orange"
          ? "Houd regime-shifts in de gaten via /macro."
          : "Geen actie nodig.",
    source: "macro-regime",
    metric: alignment,
    threshold: 40,
  };
}

function buildDrawdown(input: BuildRiskControlTowerInput): RiskCategoryReport {
  const dd = input.maxDrawdown ?? null;
  const v95 = input.valueAtRisk95 ?? null;

  // dd is negatief fractie; absolute waarde gebruikt.
  const ddAbs = dd !== null ? Math.abs(dd) : null;
  const ddScore = scoreFromThreshold(ddAbs, 0.15, 0.35);
  const v95Abs = v95 !== null ? Math.abs(v95) : null;
  const v95Score = scoreFromThreshold(v95Abs, 0.03, 0.08);
  const scores = [ddScore, v95Score].filter(
    (s): s is number => s !== null,
  );
  const score = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length)
    : null;

  const severity = severityFromScore(score);

  return {
    key: "drawdown",
    label: RISK_CATEGORY_LABELS.drawdown,
    severity,
    score,
    headlineMetric:
      ddAbs !== null
        ? `Max DD ${(ddAbs * 100).toFixed(0)}%`
        : "—",
    explanation:
      severity === "red"
        ? "Historische drawdown is groot — bereid je mentaal voor dat dit kan herhalen."
        : severity === "orange"
          ? "Drawdown is gemiddeld; past mogelijk bij je profiel, mogelijk niet."
          : severity === "gray"
            ? "Onvoldoende koershistorie voor drawdown-meting."
            : "Drawdown-historie is beperkt — portefeuille houdt het goed vol.",
    actionSuggestion:
      severity === "red"
        ? "Lees /stress-test om vooraf je reactie te bepalen — paniekverkoop in een -30% scenario is duur."
        : severity === "orange"
          ? "Reflecteer hoe je je voelt bij 25% verlies; pas eventueel cash-buffer aan."
          : "Geen actie nodig.",
    source: "risk-engine",
    metric: ddAbs,
    threshold: 0.35,
  };
}

function buildVolatility(
  input: BuildRiskControlTowerInput,
): RiskCategoryReport {
  const v = input.portfolioVolatility ?? null;
  const score = scoreFromThreshold(v, 0.15, 0.3);
  const severity = severityFromScore(score);

  return {
    key: "volatility",
    label: RISK_CATEGORY_LABELS.volatility,
    severity,
    score,
    headlineMetric: v !== null ? `${(v * 100).toFixed(0)}% p.j.` : "—",
    explanation:
      severity === "red"
        ? "Hoge volatiliteit — je portfolio kan in een maand 5-10%+ swingen."
        : severity === "orange"
          ? "Volatiliteit is bovengemiddeld; emotioneel uitdagend tijdens dips."
          : severity === "gray"
            ? "Onvoldoende historie voor volatiliteits-meting."
            : "Volatiliteit is gematigd.",
    actionSuggestion:
      severity === "red"
        ? "Controleer of vola past bij je horizon — onder 5 jaar is dit hoog."
        : severity === "orange"
          ? "Bij heftige beweging: lees /coach voordat je handelt."
          : "Geen actie nodig.",
    source: "risk-engine",
    metric: v,
    threshold: 0.3,
  };
}

function buildLiquidity(
  input: BuildRiskControlTowerInput,
): RiskCategoryReport {
  const w = input.illiquidWeight ?? null;
  const score = scoreFromThreshold(w, 0.1, 0.3);
  const severity = severityFromScore(score);

  return {
    key: "liquidity",
    label: RISK_CATEGORY_LABELS.liquidity,
    severity,
    score,
    headlineMetric:
      w !== null ? `${Math.round(w * 100)}% illiquide` : "—",
    explanation:
      severity === "red"
        ? "Veel posities zijn moeilijk verhandelbaar — verkopen in stress wordt duur."
        : severity === "orange"
          ? "Wat illiquide exposure; check bid-ask spreads bij de grootste posities."
          : severity === "gray"
            ? "Liquidity-data ontbreekt voor te veel posities."
            : "Liquiditeit is op orde — verkopen kost weinig.",
    actionSuggestion:
      severity === "red"
        ? "Bouw cash-buffer op zodat je niet hoeft te verkopen in stress."
        : severity === "orange"
          ? "Bij grote orders: gebruik limit-orders i.p.v. market."
          : "Geen actie nodig.",
    source: "risk-engine",
    metric: w,
    threshold: 0.3,
  };
}

function buildDataQuality(
  input: BuildRiskControlTowerInput,
): RiskCategoryReport {
  const depth = input.dataDepthScore ?? null;
  // depth is 0..100, hoger = beter (= minder data-risico).
  const score = scoreFromThresholdInverse(depth, 25, 70);
  const severity = severityFromScore(score);

  return {
    key: "data_quality",
    label: RISK_CATEGORY_LABELS.data_quality,
    severity,
    score,
    headlineMetric:
      depth !== null ? `Depth ${Math.round(depth)}/100` : "—",
    explanation:
      severity === "red"
        ? "Belangrijke data ontbreekt — analyses gebruiken aannames die fout kunnen zijn."
        : severity === "orange"
          ? "Niet alle databronnen aanwezig; scores blijven indicatief op sommige assets."
          : severity === "gray"
            ? "Datakwaliteit-meting niet beschikbaar."
            : "Alle belangrijke databronnen aanwezig — analyses betrouwbaar.",
    actionSuggestion:
      severity === "red"
        ? "Bekijk /portfolio → Datadekking om te zien welke posities incompleet zijn."
        : severity === "orange"
          ? "Volg datakwaliteit per asset op de portfolio-pagina."
          : "Geen actie nodig.",
    source: "data-depth",
    metric: depth,
    threshold: 25,
  };
}

function buildCryptoSpeculation(
  input: BuildRiskControlTowerInput,
): RiskCategoryReport {
  // Combineer crypto-weight + speculative-weight.
  const cw = input.cryptoWeight ?? null;
  const sw = input.speculativeWeight ?? null;
  const combined =
    cw !== null && sw !== null
      ? Math.max(cw, sw)
      : (cw ?? sw ?? null);
  const score = scoreFromThreshold(combined, 0.05, 0.2);
  const severity = severityFromScore(score);

  return {
    key: "crypto_speculation",
    label: RISK_CATEGORY_LABELS.crypto_speculation,
    severity,
    score,
    headlineMetric:
      combined !== null ? `${Math.round(combined * 100)}% spec` : "—",
    explanation:
      severity === "red"
        ? "Forse crypto/speculatieve exposure — verlies van 50%+ in een maand is historisch reëel."
        : severity === "orange"
          ? "Speculatieve laag groeit; check of dit past bij je risicobudget."
          : severity === "gray"
            ? "Geen crypto/speculatie-classificatie beschikbaar."
            : "Speculatieve exposure is beperkt.",
    actionSuggestion:
      severity === "red"
        ? "Bekijk /crypto-lab voor position-sizing-advies en stop-loss-overwegingen."
        : severity === "orange"
          ? "Bewust van de allocatie? Reflecteer op /coach."
          : "Geen actie nodig.",
    source: "crypto-lab",
    metric: combined,
    threshold: 0.2,
  };
}

function buildBehavioral(
  input: BuildRiskControlTowerInput,
): RiskCategoryReport {
  const active = input.behavioralActiveCount ?? null;
  const high = input.behavioralHighCount ?? null;

  // High-severity signals tellen 3× zwaarder dan elke active.
  const score =
    active !== null
      ? scoreFromThreshold((active + (high ?? 0) * 2) / 10, 0.2, 0.6)
      : null;
  const severity = severityFromScore(score);

  return {
    key: "behavioral",
    label: RISK_CATEGORY_LABELS.behavioral,
    severity,
    score,
    headlineMetric:
      active !== null
        ? `${active} signalen${high ? ` (${high} ernstig)` : ""}`
        : "—",
    explanation:
      severity === "red"
        ? "Meerdere gedrag-signalen actief — pauzeer voor je handelt."
        : severity === "orange"
          ? "Wat gedrag-patronen gedetecteerd; bekijk /coach voor reflectie."
          : severity === "gray"
            ? "Behavioral coach is nog niet gedraaid op deze portefeuille."
            : "Discipline ziet er rustig uit.",
    actionSuggestion:
      severity === "red"
        ? "Open /coach en doorloop de reflectie-vragen voor je nieuwe orders plaatst."
        : severity === "orange"
          ? "Lees de coaching-signalen op /coach."
          : "Geen actie nodig.",
    source: "behavioral-coach",
    metric: active,
    threshold: 5,
  };
}

// ============================================================
//  Budget + headline
// ============================================================

function computeRiskBudget(
  categories: ReadonlyArray<RiskCategoryReport>,
): RiskBudget {
  const scored = categories.filter(
    (c): c is RiskCategoryReport & { score: number } =>
      c.score !== null && c.severity !== "gray",
  );
  if (scored.length === 0) {
    return {
      used: 0,
      maxBudget: 0,
      utilization: 0,
      tone: "gray",
      summary: "Onvoldoende data om risico-budget te berekenen.",
    };
  }
  const used = scored.reduce((sum, c) => sum + c.score, 0);
  const maxBudget = scored.length * 100;
  const utilization = maxBudget > 0 ? used / maxBudget : 0;

  const tone: RiskSeverityTone =
    utilization < 0.4 ? "green" : utilization < 0.7 ? "orange" : "red";

  const summary =
    tone === "red"
      ? `Risico-budget is voor ${Math.round(utilization * 100)}% benut — krap.`
      : tone === "orange"
        ? `Risico-budget ${Math.round(utilization * 100)}% benut — ruimte voor extra positie is beperkt.`
        : `Risico-budget ${Math.round(utilization * 100)}% benut — voldoende headroom.`;

  return { used, maxBudget, utilization, tone, summary };
}

function buildHeadline(
  counts: Record<RiskSeverityTone, number>,
  budget: RiskBudget,
): string {
  if (counts.red > 0) {
    return `${counts.red} rode flag${counts.red === 1 ? "" : "s"} — directe aandacht aanbevolen.`;
  }
  if (counts.orange > 0) {
    return `${counts.orange} aandachtspunt${counts.orange === 1 ? "" : "en"} — geen alarm, wel volgen.`;
  }
  if (counts.gray >= 6) {
    return "Veel categorieën grijs — datakwaliteit beperkt het oordeel.";
  }
  return budget.tone === "green"
    ? "Portefeuille toont brede risico-spreiding."
    : "Portefeuille is in orde; check de details voor nuances.";
}
