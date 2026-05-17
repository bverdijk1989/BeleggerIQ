/**
 * 7 signaal-extractors voor watchlist-intelligence.
 *
 * Pure functies: zelfde input → identieke output. Geen Date.now /
 * randomness. Drempels staan inline als `const`.
 */

import type {
  SimilarUniverseEntry,
  WatchlistIntelligenceInput,
} from "./input";
import type {
  WatchlistAlternative,
  WatchlistSignal,
} from "./types";
import { WATCHLIST_SIGNAL_LABELS } from "./types";

// ============================================================
//  Helpers
// ============================================================

function clamp(v: number, min = 0, max = 100): number {
  if (!Number.isFinite(v)) return 50;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function pct(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

function signedPct(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  const sign = fraction >= 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(digits)}%`;
}

function notAvailable(
  key: WatchlistSignal["key"],
  rationale: string,
): WatchlistSignal {
  return {
    key,
    label: WATCHLIST_SIGNAL_LABELS[key],
    available: false,
    direction: "neutral",
    rationale,
    metric: null,
    strength: 0,
  };
}

// ============================================================
//  1. Valuation improved
// ============================================================

const VALUATION_DELTA_TRIGGER = 5; // 5-punt verbetering = positief
const VALUATION_DELTA_NEGATIVE = -5;

export function extractValuationSignal(
  input: WatchlistIntelligenceInput,
): WatchlistSignal {
  const cur = input.current.factorScore?.subScores.value;
  const prev = input.current.previousFactorScore?.subScores.value;
  if (typeof cur !== "number") {
    return notAvailable(
      "VALUATION_IMPROVED",
      "Geen factor-engine value-score beschikbaar voor deze ticker.",
    );
  }
  const delta =
    typeof prev === "number" && Number.isFinite(prev) ? cur - prev : null;

  // Direction op 2 dimensies: absolute level + delta.
  let direction: WatchlistSignal["direction"] = "neutral";
  if (cur >= 70 || (delta !== null && delta >= VALUATION_DELTA_TRIGGER)) {
    direction = "positive";
  } else if (cur <= 35 || (delta !== null && delta <= VALUATION_DELTA_NEGATIVE)) {
    direction = "negative";
  }

  // Strength combineert level + delta-magnitude.
  const levelStrength = clamp(cur);
  const deltaStrength = delta !== null ? Math.min(50, Math.abs(delta) * 5) : 0;
  const strength = clamp((levelStrength + deltaStrength) / 2);

  const fundamentals = input.current.fundamentals;
  const detailParts: string[] = [`value-score ${Math.round(cur)}/100`];
  if (delta !== null) detailParts.push(`Δ ${signedPct(delta / 100, 0)}-punten`);
  if (fundamentals?.pe !== undefined && fundamentals.pe !== null) {
    detailParts.push(`P/E ${fundamentals.pe.toFixed(1)}`);
  }
  if (fundamentals?.fcfYield !== undefined && fundamentals.fcfYield !== null) {
    detailParts.push(`FCF-yield ${pct(fundamentals.fcfYield)}`);
  }

  const rationale =
    direction === "positive"
      ? `Waardering aantrekkelijker geworden (${detailParts.join(", ")}).`
      : direction === "negative"
        ? `Waardering verslechterd of structureel duur (${detailParts.join(", ")}).`
        : `Waardering rond marktgemiddelde (${detailParts.join(", ")}).`;

  return {
    key: "VALUATION_IMPROVED",
    label: WATCHLIST_SIGNAL_LABELS.VALUATION_IMPROVED,
    available: true,
    direction,
    rationale,
    metric: cur,
    strength,
  };
}

// ============================================================
//  2. Momentum changed
// ============================================================

const MOMENTUM_DELTA_TRIGGER = 8;

export function extractMomentumSignal(
  input: WatchlistIntelligenceInput,
): WatchlistSignal {
  const cur = input.current.factorScore?.subScores.momentum;
  const prev = input.current.previousFactorScore?.subScores.momentum;
  if (typeof cur !== "number") {
    return notAvailable(
      "MOMENTUM_CHANGED",
      "Onvoldoende koershistorie voor momentum-meting.",
    );
  }
  const delta =
    typeof prev === "number" && Number.isFinite(prev) ? cur - prev : null;
  let direction: WatchlistSignal["direction"] = "neutral";
  if (delta !== null && delta >= MOMENTUM_DELTA_TRIGGER) direction = "positive";
  else if (delta !== null && delta <= -MOMENTUM_DELTA_TRIGGER) direction = "negative";
  else if (cur >= 70) direction = "positive";
  else if (cur <= 35) direction = "negative";

  const trendDescription =
    delta === null
      ? cur >= 65
        ? "trend is sterk"
        : cur <= 35
          ? "trend is zwak"
          : "trend is rustig"
      : delta >= MOMENTUM_DELTA_TRIGGER
        ? "momentum verbetert"
        : delta <= -MOMENTUM_DELTA_TRIGGER
          ? "momentum verslechtert"
          : "momentum stabiel";

  const detailParts: string[] = [`score ${Math.round(cur)}/100`];
  if (delta !== null) detailParts.push(`Δ ${delta >= 0 ? "+" : ""}${delta.toFixed(0)}`);
  return {
    key: "MOMENTUM_CHANGED",
    label: WATCHLIST_SIGNAL_LABELS.MOMENTUM_CHANGED,
    available: true,
    direction,
    rationale: `${trendDescription[0]?.toUpperCase()}${trendDescription.slice(1)} (${detailParts.join(", ")}).`,
    metric: cur,
    strength: clamp(Math.abs(cur - 50) + (delta !== null ? Math.abs(delta) : 0)),
  };
}

// ============================================================
//  3. Earnings soon
// ============================================================

const EARNINGS_NEAR_DAYS = 14;
const EARNINGS_VERY_NEAR_DAYS = 5;

export function extractEarningsSignal(
  input: WatchlistIntelligenceInput,
): WatchlistSignal {
  const next = input.current.nextEarningsDate;
  if (!next) {
    return notAvailable(
      "EARNINGS_SOON",
      "Earnings-feed niet aangesloten — geen aankomende kwartaalcijfers bekend.",
    );
  }
  const now = new Date(input.asOf).getTime();
  const earnings = new Date(next).getTime();
  if (!Number.isFinite(earnings) || earnings < now) {
    return notAvailable("EARNINGS_SOON", "Geen geldige earnings-datum.");
  }
  const daysAway = Math.round((earnings - now) / 86_400_000);
  const direction: WatchlistSignal["direction"] =
    daysAway <= EARNINGS_VERY_NEAR_DAYS ? "neutral" : "neutral";
  // Earnings-events zijn neutraal in richting maar relevant in aandacht.
  const strength =
    daysAway <= EARNINGS_VERY_NEAR_DAYS
      ? 90
      : daysAway <= EARNINGS_NEAR_DAYS
        ? 60
        : 30;

  return {
    key: "EARNINGS_SOON",
    label: WATCHLIST_SIGNAL_LABELS.EARNINGS_SOON,
    available: true,
    direction,
    rationale:
      daysAway === 0
        ? "Kwartaalcijfers vandaag — verwacht volatiliteit; thesis-test."
        : `Kwartaalcijfers over ${daysAway} dag${daysAway === 1 ? "" : "en"} — let op nieuws-/begrotingsuitspraken.`,
    metric: daysAway,
    strength,
  };
}

// ============================================================
//  4. Dividend changed
// ============================================================

const DIV_YIELD_DELTA_TRIGGER = 0.005; // 0.5pp absolute change in yield

export function extractDividendSignal(
  input: WatchlistIntelligenceInput,
): WatchlistSignal {
  const cur = input.current.fundamentals?.dividendYield ?? null;
  const prev = input.current.previousFundamentals?.dividendYield ?? null;
  if (typeof cur !== "number" || cur <= 0) {
    return notAvailable(
      "DIVIDEND_CHANGED",
      "Geen dividend-yield bekend — niet-dividendbetalend of geen data.",
    );
  }
  const delta = typeof prev === "number" ? cur - prev : null;
  let direction: WatchlistSignal["direction"] = "neutral";
  if (delta !== null && Math.abs(delta) >= DIV_YIELD_DELTA_TRIGGER) {
    // Een stijging van YIELD kan komen door koersdaling (potentieel risico)
    // óf hogere uitkering. Hier behandelen we yield-stijging als positief
    // signaal (income-investor-perspective); UI noemt het pragmatisch.
    direction = delta > 0 ? "positive" : "negative";
  }
  const rationale =
    delta === null
      ? `Dividend-yield ${pct(cur)} — geen historisch vergelijk beschikbaar.`
      : direction === "positive"
        ? `Dividend-yield ${pct(cur)} (+${(delta * 100).toFixed(2)}pp t.o.v. eerdere meting).`
        : direction === "negative"
          ? `Dividend-yield ${pct(cur)} (${(delta * 100).toFixed(2)}pp t.o.v. eerdere meting) — controleer of het dividend behouden blijft.`
          : `Dividend-yield ${pct(cur)} stabiel.`;
  return {
    key: "DIVIDEND_CHANGED",
    label: WATCHLIST_SIGNAL_LABELS.DIVIDEND_CHANGED,
    available: true,
    direction,
    rationale,
    metric: cur,
    strength:
      delta !== null
        ? clamp(50 + Math.min(50, Math.abs(delta) * 1000))
        : clamp(cur * 1500),
  };
}

// ============================================================
//  5. Macro fit
// ============================================================

export function extractMacroFitSignal(
  input: WatchlistIntelligenceInput,
): WatchlistSignal {
  const macro = input.macro;
  const assetKey = input.current.assetClassKey;
  if (!macro || !assetKey) {
    return notAvailable(
      "MACRO_FIT",
      "Geen macro-classificatie of asset-mapping voor deze ticker.",
    );
  }
  const impact = macro.assetMapping.impacts.find(
    (i) => i.assetClass === assetKey,
  );
  if (!impact) {
    return notAvailable(
      "MACRO_FIT",
      `Geen specifieke macro-impact voor deze asset-class in ${macro.classification.regime}-regime.`,
    );
  }
  const direction: WatchlistSignal["direction"] =
    impact.direction === "tailwind"
      ? "positive"
      : impact.direction === "headwind"
        ? "negative"
        : "neutral";
  return {
    key: "MACRO_FIT",
    label: WATCHLIST_SIGNAL_LABELS.MACRO_FIT,
    available: true,
    direction,
    rationale: `${macro.classification.regime}-regime: ${impact.label.toLowerCase()} krijgt ${impact.direction === "tailwind" ? "rugwind" : impact.direction === "headwind" ? "tegenwind" : "neutrale impact"} — ${impact.rationale.toLowerCase()}`,
    metric: impact.magnitude,
    strength: clamp(impact.magnitude * 100),
  };
}

// ============================================================
//  6. Sentiment shift
// ============================================================

export function extractSentimentSignal(
  input: WatchlistIntelligenceInput,
): WatchlistSignal {
  const score = input.current.sentimentScore;
  const delta = input.current.sentimentDelta;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return notAvailable(
      "SENTIMENT_SHIFT",
      "Sentiment-feed niet aangesloten — geen recente nieuws-analyse beschikbaar.",
    );
  }
  let direction: WatchlistSignal["direction"] = "neutral";
  if (score > 0.2) direction = "positive";
  else if (score < -0.2) direction = "negative";
  if (typeof delta === "number" && Math.abs(delta) > 0.3) {
    direction = delta > 0 ? "positive" : "negative";
  }
  return {
    key: "SENTIMENT_SHIFT",
    label: WATCHLIST_SIGNAL_LABELS.SENTIMENT_SHIFT,
    available: true,
    direction,
    rationale: `Sentiment-score ${score.toFixed(2)} (-1..+1)${typeof delta === "number" ? `; recent verschoven ${signedPct(delta)}` : ""}.`,
    metric: score,
    strength: clamp(Math.abs(score) * 100 + (typeof delta === "number" ? Math.abs(delta) * 50 : 0)),
  };
}

// ============================================================
//  7. Similar alternative
// ============================================================

const SIMILAR_MIN_GAP = 8; // minimaal 8-punt-better dan huidige composite
const MAX_ALTERNATIVES = 3;

export function findSimilarAlternatives(
  input: WatchlistIntelligenceInput,
): WatchlistAlternative[] {
  const sector = input.current.sector;
  const myComposite = input.current.factorScore?.composite ?? null;
  if (!sector || myComposite === null) return [];

  const candidates = input.universe.filter(
    (c) =>
      c.ticker !== input.current.ticker &&
      c.sector === sector &&
      c.compositeScore - myComposite >= SIMILAR_MIN_GAP,
  );
  if (candidates.length === 0) return [];

  // Score: similarity = sector-match (1.0) als baseline. We rangschikken
  // op composite desc — de "innovatieve hidden alpha" bovenaan (Wood-laag).
  const sorted = [...candidates].sort(
    (a, b) => b.compositeScore - a.compositeScore,
  );
  return sorted.slice(0, MAX_ALTERNATIVES).map((c) => ({
    ticker: c.ticker,
    name: c.name,
    similarity: 1.0, // sector-match is binary in deze v1; later: factor-similarity
    compositeScore: c.compositeScore,
    rationale: `${c.ticker} (sector ${sector}) scoort ${c.compositeScore.toFixed(0)}/100 — ${c.compositeScore - myComposite >= 15 ? "duidelijk" : "iets"} sterker fundamenteel profiel dan ${input.current.ticker}.`,
    source: c.source,
  }));
}

export function extractAlternativesSignal(
  input: WatchlistIntelligenceInput,
): WatchlistSignal {
  const alternatives = findSimilarAlternatives(input);
  if (alternatives.length === 0) {
    if (!input.current.sector) {
      return notAvailable(
        "SIMILAR_ALTERNATIVE",
        "Geen sector-classificatie — kan niet zoeken naar vergelijkbare tickers.",
      );
    }
    if (input.current.factorScore?.composite === undefined) {
      return notAvailable(
        "SIMILAR_ALTERNATIVE",
        "Geen factor-score — kan niet vergelijken met andere tickers.",
      );
    }
    // Geen alternatives gevonden, maar data was beschikbaar — positief
    // signaal: huidige ticker is de beste in zijn sector binnen jouw universum.
    return {
      key: "SIMILAR_ALTERNATIVE",
      label: WATCHLIST_SIGNAL_LABELS.SIMILAR_ALTERNATIVE,
      available: true,
      direction: "positive",
      rationale: `Geen sterker alternatief in jouw universum gevonden binnen sector ${input.current.sector}.`,
      metric: 0,
      strength: 30,
    };
  }
  return {
    key: "SIMILAR_ALTERNATIVE",
    label: WATCHLIST_SIGNAL_LABELS.SIMILAR_ALTERNATIVE,
    available: true,
    direction: "negative",
    rationale: `${alternatives.length} ticker${alternatives.length === 1 ? "" : "s"} in dezelfde sector scoort sterker — overweeg te vergelijken.`,
    metric: alternatives.length,
    strength: clamp(60 + alternatives.length * 10),
  };
}

// ============================================================
//  8. Volatility rising — Module 9
// ============================================================

const VOL_DELTA_TRIGGER = 0.03; // 3pp jaarvol-toename = signaal
const VOL_HIGH_ABS = 0.35;
const VOL_LOW_ABS = 0.15;

export function extractVolatilitySignal(
  input: WatchlistIntelligenceInput,
): WatchlistSignal {
  const cur = input.current.volatility;
  const prev = input.current.previousVolatility;
  if (typeof cur !== "number" || !Number.isFinite(cur)) {
    return notAvailable(
      "VOLATILITY_RISING",
      "Geen volatiliteits-meting beschikbaar voor deze ticker.",
    );
  }
  const delta =
    typeof prev === "number" && Number.isFinite(prev) ? cur - prev : null;
  let direction: WatchlistSignal["direction"] = "neutral";
  // Stijgende volatiliteit = negatief signaal (meer risico / mogelijke stress);
  // dalende volatiliteit + lage abs = positief (rust).
  if (delta !== null && delta >= VOL_DELTA_TRIGGER) direction = "negative";
  else if (delta !== null && delta <= -VOL_DELTA_TRIGGER) direction = "positive";
  else if (cur >= VOL_HIGH_ABS) direction = "negative";
  else if (cur <= VOL_LOW_ABS) direction = "positive";

  const trend =
    delta === null
      ? cur >= VOL_HIGH_ABS
        ? "verhoogd"
        : cur <= VOL_LOW_ABS
          ? "rustig"
          : "neutraal"
      : delta >= VOL_DELTA_TRIGGER
        ? "stijgend"
        : delta <= -VOL_DELTA_TRIGGER
          ? "dalend"
          : "stabiel";

  const parts: string[] = [`volatiliteit ${pct(cur, 1)}`];
  if (delta !== null) parts.push(`Δ ${signedPct(delta, 1)}-punten`);

  return {
    key: "VOLATILITY_RISING",
    label: WATCHLIST_SIGNAL_LABELS.VOLATILITY_RISING,
    available: true,
    direction,
    rationale: `Volatiliteit ${trend} (${parts.join(", ")}).`,
    metric: cur,
    strength: clamp(
      Math.abs(cur - 0.20) * 250 +
        (delta !== null ? Math.min(50, Math.abs(delta) * 500) : 0),
    ),
  };
}

// ============================================================
//  9. Data quality — Module 9 (meta-signaal)
// ============================================================

/**
 * Eenvoudige coverage-check: hoeveel kerngegevens leverde de input?
 * factorScore, fundamentals, en (optioneel) previousFactorScore — als
 * minstens 2 hiervan ontbreken, signaleer lage data-kwaliteit.
 */
export function extractDataQualitySignal(
  input: WatchlistIntelligenceInput,
): WatchlistSignal {
  const flags: string[] = [];
  if (!input.current.factorScore) flags.push("factor-score");
  if (!input.current.fundamentals) flags.push("fundamentals");
  if (!input.current.previousFactorScore) flags.push("history");
  if (!input.current.sector) flags.push("sector-classificatie");

  // Coverage als fractie (4 kerngegevens; lager = slechter).
  const coverage = clamp(((4 - flags.length) / 4) * 100);
  let direction: WatchlistSignal["direction"] = "neutral";
  if (flags.length === 0) direction = "positive";
  else if (flags.length >= 2) direction = "negative";

  const rationale =
    flags.length === 0
      ? "Alle kern-databronnen beschikbaar (factor-score, fundamentals, historiek, sector)."
      : flags.length === 1
        ? `Eén databron ontbreekt: ${flags[0]} — signalen blijven bruikbaar maar met onzekerheidsmarge.`
        : `Meerdere databronnen ontbreken (${flags.join(", ")}) — signalen leunen op partial data; interpreteer voorzichtig.`;

  return {
    key: "DATA_QUALITY",
    label: WATCHLIST_SIGNAL_LABELS.DATA_QUALITY,
    available: true,
    direction,
    rationale,
    metric: coverage / 100,
    // Datakwaliteit-strength is altijd "aandacht-relevant" — vooral hoog
    // als coverage laag is (waarschuwing) of perfect (geruststelling).
    strength: clamp(Math.abs(coverage - 50) + 40),
  };
}

// ============================================================
//  10. Opportunity vs risk — Module 9
// ============================================================

/**
 * Detecteert "kansrijk maar risicovol": hoge composite-score of sterk
 * momentum + boven-gemiddelde volatiliteit / hoge beta. Bedoeld als
 * gele-vlag voor de gebruiker, niet als afkeurend signaal.
 */
export function extractOpportunityVsRiskSignal(
  input: WatchlistIntelligenceInput,
): WatchlistSignal {
  const composite = input.current.factorScore?.composite ?? null;
  const momentum = input.current.factorScore?.subScores.momentum ?? null;
  const vol = input.current.volatility ?? null;
  const beta = input.current.beta ?? null;

  // Opportunity-side: high composite OR high momentum.
  const hasOpportunity =
    (typeof composite === "number" && composite >= 65) ||
    (typeof momentum === "number" && momentum >= 70);

  // Risk-side: hoge volatiliteit (>25%/yr) OF hoge beta (>1.3).
  const hasRisk =
    (typeof vol === "number" && vol >= 0.25) ||
    (typeof beta === "number" && beta >= 1.3);

  // Beide nodig om "kansrijk-maar-risicovol" te triggeren.
  if (!hasOpportunity && !hasRisk) {
    return notAvailable(
      "OPPORTUNITY_VS_RISK",
      "Onvoldoende kans-of-risico-indicatie — neutraal profiel.",
    );
  }
  if (!hasOpportunity || !hasRisk) {
    return {
      key: "OPPORTUNITY_VS_RISK",
      label: WATCHLIST_SIGNAL_LABELS.OPPORTUNITY_VS_RISK,
      available: true,
      direction: "neutral",
      rationale: hasOpportunity
        ? "Kansrijk profiel zonder uitgesproken risico-signalen."
        : "Verhoogd risico zonder uitgesproken kans-profiel — afblijven kan ook een keuze zijn.",
      metric: typeof composite === "number" ? composite : null,
      strength: 35,
    };
  }
  // Beide aanwezig — gele vlag.
  const detailParts: string[] = [];
  if (typeof composite === "number") detailParts.push(`composite ${Math.round(composite)}/100`);
  if (typeof momentum === "number") detailParts.push(`momentum ${Math.round(momentum)}/100`);
  if (typeof vol === "number") detailParts.push(`vol ${pct(vol)}`);
  if (typeof beta === "number") detailParts.push(`β ${beta.toFixed(2)}`);

  return {
    key: "OPPORTUNITY_VS_RISK",
    label: WATCHLIST_SIGNAL_LABELS.OPPORTUNITY_VS_RISK,
    available: true,
    direction: "neutral",
    rationale: `Kansrijk profiel maar verhoogd risico (${detailParts.join(", ")}). Een kleinere positiegrootte of bewuste horizon kan helpen.`,
    metric: typeof composite === "number" ? composite : null,
    strength: 75,
  };
}

// ============================================================
//  11. Profile fit — Module 9
// ============================================================

/**
 * Past de asset bij het user-profiel (risk-tolerance + horizon)?
 * Heuristische match — geen advies. Volwassen versie zou tegen het
 * volledige allocation-model checken; voor v1 hanteren we duidelijke
 * regels op assetClassKey × riskTolerance × horizon.
 */
export function extractProfileFitSignal(
  input: WatchlistIntelligenceInput,
): WatchlistSignal {
  const profile = input.userProfile;
  const assetKey = input.current.assetClassKey;
  if (!profile) {
    return notAvailable(
      "PROFILE_FIT",
      "Geen user-profiel beschikbaar — fit kan niet bepaald worden.",
    );
  }
  if (!assetKey) {
    return notAvailable(
      "PROFILE_FIT",
      "Geen asset-classificatie — fit kan niet bepaald worden.",
    );
  }

  // Heuristiek: defensieve profielen + groei-aandelen of crypto = matig fit.
  // Agressieve profielen + cash/bonds = matig fit (te conservatief).
  const isDefensiveProfile =
    profile.riskTolerance === "CONSERVATIVE" || profile.investmentHorizonYrs < 5;
  const isAggressiveProfile =
    profile.riskTolerance === "AGGRESSIVE" && profile.investmentHorizonYrs >= 10;
  const isHighVolAsset =
    assetKey === "EQUITY_GROWTH" || assetKey === "EQUITY_CYCLICAL" || assetKey === "COMMODITIES";
  const isLowVolAsset =
    assetKey === "BOND_GOVERNMENT" || assetKey === "CASH" || assetKey === "BOND_CORPORATE";

  let direction: WatchlistSignal["direction"];
  let rationale: string;
  let strength: number;
  if (isDefensiveProfile && isHighVolAsset) {
    direction = "negative";
    rationale = `${profile.riskTolerance}-profiel + horizon ${profile.investmentHorizonYrs}jr past minder bij volatiele asset — overweeg een kleinere positiegrootte.`;
    strength = 70;
  } else if (isAggressiveProfile && isLowVolAsset) {
    direction = "negative";
    rationale = `${profile.riskTolerance}-profiel + horizon ${profile.investmentHorizonYrs}jr is gericht op groei — defensieve asset past niet optimaal bij dit doel.`;
    strength = 55;
  } else if (
    (profile.riskTolerance === "BALANCED" || profile.riskTolerance === "GROWTH") &&
    !isLowVolAsset
  ) {
    direction = "positive";
    rationale = `${profile.riskTolerance}-profiel + horizon ${profile.investmentHorizonYrs}jr sluit goed aan bij deze asset-class.`;
    strength = 55;
  } else {
    direction = "neutral";
    rationale = `Geen uitgesproken mismatch tussen ${profile.riskTolerance}-profiel en deze asset-class.`;
    strength = 40;
  }

  return {
    key: "PROFILE_FIT",
    label: WATCHLIST_SIGNAL_LABELS.PROFILE_FIT,
    available: true,
    direction,
    rationale,
    metric: null,
    strength,
  };
}

// ============================================================
//  Public registry
// ============================================================

export const ALL_EXTRACTORS = [
  extractValuationSignal,
  extractMomentumSignal,
  extractVolatilitySignal,
  extractEarningsSignal,
  extractDividendSignal,
  extractMacroFitSignal,
  extractSentimentSignal,
  extractAlternativesSignal,
  extractDataQualitySignal,
  extractOpportunityVsRiskSignal,
  extractProfileFitSignal,
] as const;

/** Helper voor universe-bouw. */
export function asUniverseEntry(
  ticker: string,
  name: string,
  sector: string | null,
  composite: number | null,
  source: "portfolio" | "watchlist",
): SimilarUniverseEntry | null {
  if (composite === null || !Number.isFinite(composite)) return null;
  return { ticker, name, sector, compositeScore: composite, source };
}
