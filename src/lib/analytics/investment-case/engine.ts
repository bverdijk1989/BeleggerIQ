/**
 * Stock Story & Investment Case — pure-function engine (Module 31).
 *
 * Neemt geconsolideerde inputs (classificatie + fundamentals + factor-scores
 * + portfolio-fit + data-depth) en produceert 8 sub-cards in eenvoudige NL.
 *
 * **Geen verzonnen bedrijfsfeiten**: alle facts komen uit harde data.
 * Bij ontbrekende data: card.quality = "missing" + body benoemt expliciet
 * wat ontbreekt. Hedged taal in alle suggesties.
 */

import type { ISODateString } from "@/types/common";
import type {
  HoldingClassificationMeta,
} from "@/types/portfolio";
import type {
  FundamentalsSnapshot,
  FactorScore,
} from "@/types/factor";

import type { AssetDataDepth } from "@/lib/analytics/data-depth";
import type { InvestmentConfidenceScore } from "@/lib/analytics/signal-fusion";

import {
  CARD_LABELS,
  CARD_ORDER,
  INVESTMENT_CASE_DISCLAIMER,
  type InvestmentCase,
  type InvestmentCaseAssetKind,
  type InvestmentCaseCard,
  type InvestmentCaseCardKey,
} from "./types";

export interface BuildInvestmentCaseInput {
  generatedAt: ISODateString;
  ticker: string;
  name: string | null;
  /** Asset-class uit Holding. */
  assetClass: "EQUITY" | "ETF" | "BOND" | "REIT" | "COMMODITY" | "CRYPTO" | "CASH" | "OTHER";
  /** Optionele instrument-classificatie (SINGLE_STOCK / BROAD_MARKET_ETF / ...). */
  classification: HoldingClassificationMeta | null;
  /** Sector uit holding of enrichment. */
  sector: string | null;
  /** Industry uit enrichment. */
  industry: string | null;
  /** Country uit enrichment. */
  country: string | null;
  /** Region uit enrichment. */
  region: string | null;
  /** Optionele bedrijfs-beschrijving (Yahoo `longBusinessSummary`). */
  businessSummary: string | null;
  /** Fundamentals — voor "strong points" en "risks". */
  fundamentals: FundamentalsSnapshot | null;
  /** Factor-score voor "interessant" indicatie. */
  factorScore: FactorScore | null;
  /** Confidence-score uit Signal Fusion — voor signals_to_watch + conclusion. */
  confidence: InvestmentConfidenceScore | null;
  /** Portfolio-context: weight (0..1) in user's portfolio. null bij niet-in-portfolio. */
  portfolioWeight: number | null;
  /** Portfolio sector-concentration HHI (0..1). */
  portfolioSectorHhi: number | null;
  /** Data-depth voor dit asset. */
  dataDepth: AssetDataDepth | null;
}

/**
 * Hoofd-aggregator.
 */
export function buildInvestmentCase(
  input: BuildInvestmentCaseInput,
): InvestmentCase {
  const assetKind = deriveAssetKind(input.assetClass, input.classification);
  const builderByKey: Record<
    InvestmentCaseCardKey,
    () => InvestmentCaseCard
  > = {
    what_it_does: () => buildWhatItDoes(input, assetKind),
    why_interesting: () => buildWhyInteresting(input, assetKind),
    strengths: () => buildStrengths(input),
    risks: () => buildRisks(input, assetKind),
    signals_to_watch: () => buildSignalsToWatch(input),
    portfolio_fit: () => buildPortfolioFit(input, assetKind),
    missing_data: () => buildMissingData(input),
    conclusion: () => buildConclusion(input, assetKind),
  };

  const cards = CARD_ORDER.map((k) => builderByKey[k]());

  return {
    ticker: input.ticker,
    name: input.name,
    assetKind,
    generatedAt: input.generatedAt,
    cards,
    dataDepth: input.dataDepth,
    mode: "deterministic",
    disclaimer: INVESTMENT_CASE_DISCLAIMER,
  };
}

// ============================================================
//  Asset-kind detection
// ============================================================

function deriveAssetKind(
  assetClass: BuildInvestmentCaseInput["assetClass"],
  classification: HoldingClassificationMeta | null,
): InvestmentCaseAssetKind {
  if (assetClass === "CRYPTO") return "crypto";
  if (assetClass === "BOND") return "bond";
  if (assetClass === "COMMODITY") return "commodity";
  if (assetClass === "ETF") {
    if (classification?.isBroadMarket) return "broad_market_etf";
    if (classification?.isIncomeFocused) return "income_etf";
    return "thematic_etf";
  }
  if (assetClass === "EQUITY" || assetClass === "REIT") return "single_stock";
  return "unknown";
}

// ============================================================
//  Card-builders — alle pure, gegrond in input-data
// ============================================================

function buildWhatItDoes(
  input: BuildInvestmentCaseInput,
  assetKind: InvestmentCaseAssetKind,
): InvestmentCaseCard {
  const key: InvestmentCaseCardKey = "what_it_does";
  const label = CARD_LABELS[key];

  // 1) Als business-summary aanwezig is, gebruik die (cap 300 chars).
  if (input.businessSummary && input.businessSummary.length > 30) {
    const summary = trim(input.businessSummary, 300);
    return {
      key,
      label,
      body: summary,
      bullets: [],
      quality: "solid",
      source: "yahoo-asset-profile",
    };
  }

  // 2) ETF: gebruik classification-type + sector-focus.
  if (
    assetKind === "broad_market_etf" ||
    assetKind === "income_etf" ||
    assetKind === "thematic_etf"
  ) {
    const cls = input.classification;
    const desc = describeEtf(assetKind, cls);
    return {
      key,
      label,
      body: desc,
      bullets: [],
      quality: cls ? "partial" : "missing",
      source: "classification",
    };
  }

  // 3) Single stock / REIT zonder business-summary: sector + industry.
  if (assetKind === "single_stock") {
    if (input.sector || input.industry) {
      const parts: string[] = [];
      if (input.industry) parts.push(`actief in de ${input.industry.toLowerCase()}-industrie`);
      else if (input.sector) parts.push(`actief in de sector ${input.sector.toLowerCase()}`);
      if (input.country) parts.push(`gevestigd in ${input.country}`);
      const body = `${input.name ?? input.ticker} is een onderneming ${parts.join(" en ")}. Een uitgebreide bedrijfsbeschrijving ontbreekt — raadpleeg de officiële kanalen voor details.`;
      return {
        key,
        label,
        body,
        bullets: [],
        quality: "partial",
        source: "enrichment",
      };
    }
  }

  // 4) Crypto / commodity / bond / unknown
  switch (assetKind) {
    case "crypto":
      return {
        key,
        label,
        body: `${input.ticker} is een crypto-positie. Volatiliteit is doorgaans hoog en koersbewegingen kunnen losstaan van traditionele asset-classes.`,
        bullets: [],
        quality: "partial",
        source: "asset-class",
      };
    case "bond":
      return {
        key,
        label,
        body: `${input.name ?? input.ticker} is een obligatie-positie. Koers reageert primair op rente-bewegingen.`,
        bullets: [],
        quality: "partial",
        source: "asset-class",
      };
    case "commodity":
      return {
        key,
        label,
        body: `${input.name ?? input.ticker} is een commodity-positie. Prijs reageert op vraag/aanbod-balans en valuta-effecten.`,
        bullets: [],
        quality: "partial",
        source: "asset-class",
      };
    default:
      return {
        key,
        label,
        body: `Bedrijfs- of fonds-beschrijving van ${input.ticker} ontbreekt in onze data. Raadpleeg officiële documentatie voor details.`,
        bullets: [],
        quality: "missing",
        source: "fallback",
      };
  }
}

function describeEtf(
  kind: Exclude<InvestmentCaseAssetKind, "single_stock" | "bond" | "commodity" | "crypto" | "unknown">,
  cls: HoldingClassificationMeta | null,
): string {
  if (kind === "broad_market_etf") {
    return `Een breed-marktindex-fonds. Het volgt een groot aantal aandelen en biedt instant-spreiding zonder dat je individuele bedrijven hoeft te kiezen.`;
  }
  if (kind === "income_etf") {
    const strat = cls?.incomeStrategy
      ? ` met ${cls.incomeStrategy.toLowerCase()}-strategie`
      : "";
    return `Een inkomen-gericht fonds${strat}. De focus ligt op uitkeringen (dividend, coupon) eerder dan koerswinst.`;
  }
  // thematic_etf
  const sector = cls?.sectorFocus
    ? ` op de sector ${cls.sectorFocus.toLowerCase()}`
    : "";
  return `Een thematisch ETF${sector}. Meer geconcentreerd dan een breed-marktfonds; let op sector-cyclische risico's.`;
}

function buildWhyInteresting(
  input: BuildInvestmentCaseInput,
  assetKind: InvestmentCaseAssetKind,
): InvestmentCaseCard {
  const key: InvestmentCaseCardKey = "why_interesting";
  const label = CARD_LABELS[key];

  const bullets: string[] = [];

  // Confidence-tier eerst (sterkste signaal).
  if (input.confidence) {
    const tier = input.confidence.tier;
    if (tier === "STRONG" || tier === "POSITIVE") {
      bullets.push(
        `BeleggerIQ Confidence: ${tier === "STRONG" ? "Sterk" : "Positief"} (${input.confidence.totalScore}/100).`,
      );
    }
  }

  // Factor-composite (Buffett-laag).
  if (input.factorScore && Number.isFinite(input.factorScore.composite)) {
    const c = input.factorScore.composite;
    if (c >= 0.7) {
      bullets.push(`Factor-composite ${(c * 100).toFixed(0)}/100 — sterk op meerdere assen.`);
    } else if (c >= 0.55) {
      bullets.push(`Factor-composite ${(c * 100).toFixed(0)}/100 — bovengemiddeld.`);
    }
  }

  // Sub-scores: quality, value, momentum.
  if (input.factorScore?.subScores) {
    const subs = input.factorScore.subScores;
    if (typeof subs.quality === "number" && subs.quality >= 0.7) {
      bullets.push(`Hoge kwaliteit-score (${(subs.quality * 100).toFixed(0)}/100): solide marges en winstgevendheid.`);
    }
    if (typeof subs.value === "number" && subs.value >= 0.65) {
      bullets.push(`Aantrekkelijke waardering (${(subs.value * 100).toFixed(0)}/100) — niet duur t.o.v. peers.`);
    }
    if (typeof subs.dividend === "number" && subs.dividend >= 0.7) {
      bullets.push(`Sterke dividend-kenmerken (${(subs.dividend * 100).toFixed(0)}/100).`);
    }
  }

  // ETF: spreiding/income.
  if (assetKind === "broad_market_etf") {
    bullets.push(`Lage kosten per spreiding — geschikt als kern-positie.`);
  } else if (assetKind === "income_etf") {
    bullets.push(`Voorspelbare uitkeringen — interessant voor cash-flow-georiënteerde beleggers.`);
  }

  const quality: InvestmentCaseCard["quality"] =
    bullets.length === 0 ? "missing" : bullets.length <= 2 ? "partial" : "solid";

  const body =
    bullets.length === 0
      ? "Geen sterke positieve signalen in de huidige data. Dat betekent niet dat het niet interessant is — wel dat onze metrics geen uitgesproken case zien."
      : "Op basis van de factor-scores en classificatie zien we de volgende aanknopingspunten.";

  return {
    key,
    label,
    body,
    bullets,
    quality,
    source: "factor-engine + signal-fusion",
  };
}

function buildStrengths(input: BuildInvestmentCaseInput): InvestmentCaseCard {
  const key: InvestmentCaseCardKey = "strengths";
  const label = CARD_LABELS[key];

  const bullets: string[] = [];
  const f = input.fundamentals;

  if (f) {
    if (typeof f.roic === "number" && f.roic >= 0.15) {
      bullets.push(`ROIC ${(f.roic * 100).toFixed(1)}% — bovengemiddelde kapitaalefficiëntie.`);
    }
    if (typeof f.netMargin === "number" && f.netMargin >= 0.15) {
      bullets.push(`Netto-marge ${(f.netMargin * 100).toFixed(1)}% — solide winstgevendheid.`);
    }
    if (typeof f.debtToEquity === "number" && f.debtToEquity <= 0.5) {
      bullets.push(`Lage schuld (D/E ${f.debtToEquity.toFixed(2)}) — financiële flexibiliteit.`);
    }
    if (typeof f.fcfYield === "number" && f.fcfYield >= 0.05) {
      bullets.push(`FCF-yield ${(f.fcfYield * 100).toFixed(1)}% — sterke vrije kasstroom-generatie.`);
    }
    if (typeof f.dividendGrowth5y === "number" && f.dividendGrowth5y >= 0.05) {
      bullets.push(`Dividendgroei 5j: ${(f.dividendGrowth5y * 100).toFixed(1)}%/jr.`);
    }
  }

  // ETF: classification-flags.
  const cls = input.classification;
  if (cls?.isBroadMarket) {
    bullets.push(`Breed-marktdekking — diversificatie ingebouwd.`);
  }

  const quality: InvestmentCaseCard["quality"] =
    bullets.length === 0
      ? f === null
        ? "missing"
        : "partial"
      : bullets.length >= 3
        ? "solid"
        : "partial";

  const body =
    bullets.length === 0
      ? f === null
        ? "Fundamentele data ontbreekt — sterke punten zijn niet automatisch te bepalen."
        : "Geen uitspringende sterke punten in de fundamentals. Dit betekent niet dat het zwak is — wel dat geen enkele metric significant boven gemiddeld scoort."
      : "Op basis van de meest recente fundamentals.";

  return {
    key,
    label,
    body,
    bullets: bullets.slice(0, 5),
    quality,
    source: "fundamentals",
  };
}

function buildRisks(
  input: BuildInvestmentCaseInput,
  assetKind: InvestmentCaseAssetKind,
): InvestmentCaseCard {
  const key: InvestmentCaseCardKey = "risks";
  const label = CARD_LABELS[key];

  const bullets: string[] = [];
  const f = input.fundamentals;

  if (f) {
    if (typeof f.debtToEquity === "number" && f.debtToEquity >= 1.5) {
      bullets.push(`Hoge schuld (D/E ${f.debtToEquity.toFixed(2)}) — gevoelig voor rente-stijgingen.`);
    }
    if (typeof f.pe === "number" && f.pe >= 30) {
      bullets.push(`Hoge waardering (P/E ${f.pe.toFixed(1)}) — risico op multiple-compressie.`);
    }
    if (typeof f.netMargin === "number" && f.netMargin <= 0.05) {
      bullets.push(`Lage netto-marge (${(f.netMargin * 100).toFixed(1)}%) — winstgevendheid kwetsbaar.`);
    }
    if (typeof f.payoutRatio === "number" && f.payoutRatio >= 0.9) {
      bullets.push(`Hoge payout-ratio (${(f.payoutRatio * 100).toFixed(0)}%) — dividend kwetsbaar bij winstdaling.`);
    }
  }

  // Asset-kind generic risks.
  if (assetKind === "crypto") {
    bullets.push(`Crypto kan in een maand 50%+ verliezen — alleen positie nemen met geld dat je kunt missen.`);
  }
  if (assetKind === "thematic_etf") {
    bullets.push(`Themafondsen zijn cyclischer dan brede markt; rotatie kan de positie hard raken.`);
  }
  if (assetKind === "bond") {
    bullets.push(`Stijgende rente drukt obligatie-koersen; duration bepaalt de gevoeligheid.`);
  }

  // Confidence-tier WEAK of AVOID.
  if (input.confidence && (input.confidence.tier === "WEAK" || input.confidence.tier === "AVOID")) {
    bullets.push(`BeleggerIQ Confidence: ${input.confidence.tier} (${input.confidence.totalScore}/100) — signalen zijn niet ondersteunend.`);
  }

  const quality: InvestmentCaseCard["quality"] =
    bullets.length === 0
      ? f === null
        ? "missing"
        : "partial"
      : "solid";

  const body =
    bullets.length === 0
      ? f === null
        ? "Risico-analyse beperkt — fundamentele data ontbreekt."
        : "Geen uitspringende risico-signalen in de fundamentals. Standaard markt- en sector-risico's blijven natuurlijk gelden."
      : "Op basis van de meest recente data — niet alle risico's zijn meetbaar.";

  return {
    key,
    label,
    body,
    bullets: bullets.slice(0, 5),
    quality,
    source: "fundamentals + classification",
  };
}

function buildSignalsToWatch(
  input: BuildInvestmentCaseInput,
): InvestmentCaseCard {
  const key: InvestmentCaseCardKey = "signals_to_watch";
  const label = CARD_LABELS[key];

  const bullets: string[] = [];

  if (input.confidence) {
    // Top-3 signalen uit confidence breakdown met laagste score (= aandacht).
    const ranked = [...input.confidence.signals]
      .filter((s) => s.score !== null)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .slice(0, 3);
    for (const sig of ranked) {
      bullets.push(`${sig.label}: nu ${sig.score}/100 — ${sig.rationale}`);
    }
  }

  // Macro/regime indien factor-score iets zegt.
  if (input.factorScore?.subScores?.momentum !== undefined) {
    const m = input.factorScore.subScores.momentum;
    if (typeof m === "number") {
      const tone = m >= 0.6 ? "positief" : m <= 0.4 ? "verzwakt" : "gemengd";
      bullets.push(`Momentum is nu ${tone} — volg of dit consolideert of draait.`);
    }
  }

  const quality: InvestmentCaseCard["quality"] =
    bullets.length === 0 ? "missing" : bullets.length >= 2 ? "solid" : "partial";

  const body =
    bullets.length === 0
      ? "Geen specifieke signalen actief — volg algemene markt-context."
      : "Specifieke signalen die je in de gaten kunt houden — geen koop/verkoop-triggers.";

  return {
    key,
    label,
    body,
    bullets: bullets.slice(0, 5),
    quality,
    source: "signal-fusion + factor-engine",
  };
}

function buildPortfolioFit(
  input: BuildInvestmentCaseInput,
  assetKind: InvestmentCaseAssetKind,
): InvestmentCaseCard {
  const key: InvestmentCaseCardKey = "portfolio_fit";
  const label = CARD_LABELS[key];

  const bullets: string[] = [];
  const w = input.portfolioWeight;

  if (w === null) {
    return {
      key,
      label,
      body: `${input.ticker} zit nog niet in je portefeuille. Bij toevoegen: let op weging en sector-overlap.`,
      bullets: [],
      quality: "partial",
      source: "portfolio-view",
    };
  }

  bullets.push(`Huidige weging: ${(w * 100).toFixed(1)}% van de portefeuille.`);

  if (w >= 0.15) {
    bullets.push(`Dit is een grote positie — verlies in deze positie tikt zichtbaar door.`);
  } else if (w <= 0.02) {
    bullets.push(`Kleine positie — beperkte impact, ook bij grote bewegingen.`);
  }

  if (input.portfolioSectorHhi !== null && assetKind === "single_stock" && input.sector) {
    bullets.push(`Sector-context: ${input.sector}. Check sector-concentratie op /risk-tower.`);
  }

  if (assetKind === "crypto" && w >= 0.05) {
    bullets.push(`Crypto-weging ≥ 5% — verhoogt portfolio-volatiliteit substantieel.`);
  }

  return {
    key,
    label,
    body: "Op basis van je huidige weging — past dit bij je risicobudget en spreiding?",
    bullets,
    quality: "solid",
    source: "portfolio-view + risk-engine",
  };
}

function buildMissingData(
  input: BuildInvestmentCaseInput,
): InvestmentCaseCard {
  const key: InvestmentCaseCardKey = "missing_data";
  const label = CARD_LABELS[key];

  const missing: string[] = [];
  if (input.dataDepth) {
    for (const m of input.dataDepth.missing) {
      missing.push(labelDimension(m));
    }
  }

  if (!input.businessSummary) {
    missing.push("Bedrijfs-/fonds-beschrijving");
  }
  if (!input.fundamentals) {
    missing.push("Fundamentele cijfers (P/E, marges, ROIC)");
  }
  if (!input.factorScore) {
    missing.push("Factor-scores");
  }
  if (!input.sector && !input.industry) {
    missing.push("Sector/industry-classificatie");
  }

  const quality: InvestmentCaseCard["quality"] =
    missing.length === 0 ? "solid" : missing.length <= 2 ? "partial" : "missing";

  const body =
    missing.length === 0
      ? "Belangrijke databronnen zijn aanwezig — analyses zijn betrouwbaar."
      : "De volgende bronnen ontbreken of zijn beperkt — onze conclusies blijven indicatief.";

  return {
    key,
    label,
    body,
    bullets: [...new Set(missing)].slice(0, 6),
    quality,
    source: "data-depth + fundamentals",
  };
}

function labelDimension(d: string): string {
  switch (d) {
    case "live_price":
      return "Actuele koers";
    case "fundamentals":
      return "Fundamentele cijfers";
    case "dividend":
      return "Dividend-historie";
    case "macro":
      return "Macro-context";
    case "history":
      return "Koershistorie";
    default:
      return d;
  }
}

function buildConclusion(
  input: BuildInvestmentCaseInput,
  assetKind: InvestmentCaseAssetKind,
): InvestmentCaseCard {
  const key: InvestmentCaseCardKey = "conclusion";
  const label = CARD_LABELS[key];

  // Bepaal toon op basis van confidence + data-depth.
  const conf = input.confidence;
  const depth = input.dataDepth;

  let conclusion: string;
  let quality: InvestmentCaseCard["quality"] = "partial";

  if (conf) {
    quality = "solid";
    switch (conf.tier) {
      case "STRONG":
        conclusion = `Signalen wijzen op een sterke case voor ${input.ticker} — kwaliteit, waardering en context lijken aligned. Doe alsnog eigen onderzoek voor je beslist.`;
        break;
      case "POSITIVE":
        conclusion = `${input.ticker} toont overwegend positieve signalen, maar geen uitgesproken sterke case. Past mogelijk goed bij een gespreide portefeuille.`;
        break;
      case "NEUTRAL":
        conclusion = `Signalen voor ${input.ticker} zijn gemengd — geen uitgesproken koop- of vermijdsignaal. Volg de specifieke signalen onder "Signalen om te volgen".`;
        break;
      case "WEAK":
        conclusion = `${input.ticker} laat zwakke signalen zien — verhoogde voorzichtigheid is gepast. Controleer of de positie past bij je horizon.`;
        break;
      case "AVOID":
        conclusion = `${input.ticker} scoort laag op meerdere signalen. Dat is geen verkoop-advies, wel een signaal om de positie kritisch tegen het licht te houden.`;
        break;
    }
  } else if (depth && depth.score >= 60) {
    conclusion = `Beperkte signalen-analyse, maar datakwaliteit is acceptabel. Gebruik de overige cards voor een eerste oordeel.`;
    quality = "partial";
  } else if (assetKind === "broad_market_etf") {
    conclusion = `Een breed-marktfonds biedt instant-spreiding en is geschikt als kern-positie. Eigen analyse-werk beperkt.`;
    quality = "solid";
  } else {
    conclusion = `Onvoldoende data voor een sterke conclusie. Raadpleeg externe bronnen voor je beslist.`;
    quality = "missing";
  }

  return {
    key,
    label,
    body: conclusion,
    bullets: [],
    quality,
    source: "signal-fusion + data-depth",
  };
}

// ============================================================
//  Helpers
// ============================================================

function trim(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}
