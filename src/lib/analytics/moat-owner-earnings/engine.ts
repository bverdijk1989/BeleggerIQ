/**
 * Moat & Owner Earnings Engine — pure-function (Module 32).
 *
 * Buffett-perspectief: kwaliteit boven valuation, boven momentum. Per
 * component een aparte score 0..100 (of null bij missing data),
 * coverage-weighted composite.
 *
 * **Geen nep-scores**: bij ontbrekende fundamentals → component score
 * = null. Composite wordt gewogen over alleen aanwezige componenten;
 * bij coverage < 0.4 → composite = null + grade = "unknown".
 */

import type { ISODateString } from "@/types/common";
import type { FundamentalsSnapshot } from "@/types/factor";

import {
  COMPONENT_LABELS,
  COMPONENT_ORDER,
  COMPONENT_WEIGHTS,
  MOAT_DISCLAIMER,
  gradeFromScore,
  type MoatComponent,
  type MoatComponentKey,
  type MoatReport,
} from "./types";

export interface BuildMoatReportInput {
  ticker: string;
  asOf: ISODateString;
  fundamentals: FundamentalsSnapshot | null;
  /**
   * Optioneel: krijgt deze asset dividend? Bepaalt of `dividend_safety`
   * wordt meegewogen (anders score=null en uitgesloten).
   */
  hasDividend?: boolean;
}

/**
 * Hoofd-aggregator.
 */
export function buildMoatReport(input: BuildMoatReportInput): MoatReport {
  const f = input.fundamentals;
  const hasDividend = input.hasDividend ?? typeof f?.dividendYield === "number";

  const componentBuilders: Record<MoatComponentKey, () => MoatComponent> = {
    return_on_capital: () => buildReturnOnCapital(f),
    fcf_quality: () => buildFcfQuality(f),
    owner_earnings: () => buildOwnerEarnings(f),
    margin_stability: () => buildMarginStability(f),
    earnings_growth_quality: () => buildEarningsGrowthQuality(f),
    debt_sustainability: () => buildDebtSustainability(f),
    dividend_safety: () => buildDividendSafety(f, hasDividend),
    pricing_power: () => buildPricingPower(f),
    moat_confidence: () => buildMoatConfidence(f),
    data_coverage: () => buildDataCoverage(f),
  };

  const components = COMPONENT_ORDER.map((k) => componentBuilders[k]());

  // Composite: gewichten-genormaliseerd over scored componenten.
  const scored = components.filter(
    (c): c is MoatComponent & { score: number } => c.score !== null,
  );
  const totalWeight = scored.reduce((sum, c) => sum + c.weight, 0);
  const totalAvailableWeight = components.reduce(
    (sum, c) => sum + c.weight,
    0,
  );
  const coverage =
    totalAvailableWeight > 0 ? totalWeight / totalAvailableWeight : 0;
  const compositeScore =
    scored.length > 0 && coverage >= 0.4
      ? Math.round(
          scored.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight,
        )
      : null;

  const grade = gradeFromScore(compositeScore, coverage);
  const confidence =
    coverage >= 0.75 ? "high" :
    coverage >= 0.5 ? "medium" :
    coverage >= 0.25 ? "low" : "insufficient";

  const warnings = buildWarnings(components, coverage);
  const headline = buildHeadline(grade, compositeScore, components);

  return {
    ticker: input.ticker.toUpperCase(),
    asOf: input.asOf,
    compositeScore,
    grade,
    coverage: Math.round(coverage * 100) / 100,
    confidence,
    components,
    headline,
    warnings,
    disclaimer: MOAT_DISCLAIMER,
  };
}

// ============================================================
//  Componenten — pure builders, conservatieve defaults
// ============================================================

function buildReturnOnCapital(
  f: FundamentalsSnapshot | null,
): MoatComponent {
  const key: MoatComponentKey = "return_on_capital";
  const label = COMPONENT_LABELS[key];
  const weight = COMPONENT_WEIGHTS[key];

  if (!f || (typeof f.roic !== "number" && typeof f.roe !== "number")) {
    return missingComponent(key, label, weight, ["roic", "roe"]);
  }

  const inputsUsed: string[] = [];
  let score: number;
  let rationale: string;
  let metric: number | null = null;

  if (typeof f.roic === "number") {
    inputsUsed.push("roic");
    metric = f.roic;
    // ROIC 5% → 30, 15% → 70, 25% → 90.
    score = clampScore(linear(f.roic, 0.05, 0.25, 30, 90));
    rationale =
      score >= 70
        ? `Sterke ROIC (${pct(f.roic)}) — efficiënt kapitaalgebruik, klassiek moat-signaal.`
        : score <= 40
          ? `Lage ROIC (${pct(f.roic)}) — beperkte rendementsmotor, mogelijk gebrek aan competitive advantage.`
          : `ROIC ${pct(f.roic)} — gemiddelde kapitaalefficiëntie.`;
  } else {
    inputsUsed.push("roe");
    metric = f.roe!;
    // ROE 10% → 30, 20% → 70, 30% → 90.
    score = clampScore(linear(f.roe!, 0.1, 0.3, 30, 90));
    rationale =
      score >= 70
        ? `Sterke ROE (${pct(f.roe!)}) — let op: ROIC ontbreekt, ROE kan hefboom maskeren.`
        : `ROE ${pct(f.roe!)} — ROIC ontbreekt voor zuiver kapitaal-oordeel.`;
  }

  const missing: string[] = [];
  if (typeof f.roic !== "number") missing.push("roic");
  if (typeof f.roe !== "number") missing.push("roe");

  return { key, label, score, weight, rationale, inputsUsed, inputsMissing: missing, metric };
}

function buildFcfQuality(f: FundamentalsSnapshot | null): MoatComponent {
  const key: MoatComponentKey = "fcf_quality";
  const label = COMPONENT_LABELS[key];
  const weight = COMPONENT_WEIGHTS[key];

  if (!f || typeof f.fcfYield !== "number") {
    return missingComponent(key, label, weight, ["fcfYield"]);
  }

  // FCF-yield 2% → 30, 5% → 65, 8% → 85, 10%+ → 92.
  const y = f.fcfYield;
  let score: number;
  if (y <= 0.02) score = 30;
  else if (y <= 0.05) score = clampScore(linear(y, 0.02, 0.05, 30, 65));
  else if (y <= 0.08) score = clampScore(linear(y, 0.05, 0.08, 65, 85));
  else score = clampScore(linear(y, 0.08, 0.12, 85, 92));

  const rationale =
    score >= 70
      ? `Sterke vrije kasstroom (${pct(y)} FCF-yield) — solide owner-earnings.`
      : score <= 40
        ? `Beperkte vrije cashflow (${pct(y)}) — winst hangt mogelijk aan accounting i.p.v. cash.`
        : `FCF-yield ${pct(y)} — acceptabel niveau.`;

  return { key, label, score, weight, rationale, inputsUsed: ["fcfYield"], inputsMissing: [], metric: y };
}

function buildOwnerEarnings(f: FundamentalsSnapshot | null): MoatComponent {
  const key: MoatComponentKey = "owner_earnings";
  const label = COMPONENT_LABELS[key];
  const weight = COMPONENT_WEIGHTS[key];

  // Buffett owner-earnings = NI + D&A - maint-capex - WC-change.
  // Zonder cashflow-statement details: gebruik FCF-yield × consistency.
  // Consistency proxy: stabiele netMargin + FCF-yield > 0.
  if (!f || typeof f.fcfYield !== "number") {
    return missingComponent(key, label, weight, ["fcfYield"]);
  }
  if (f.fcfYield <= 0) {
    return {
      key,
      label,
      score: 25,
      weight,
      rationale: `Negatieve FCF-yield (${pct(f.fcfYield)}) — owner-earnings zijn op dit moment negatief, structureel een rode flag voor moat.`,
      inputsUsed: ["fcfYield"],
      inputsMissing: [],
      metric: f.fcfYield,
    };
  }

  const baseScore = clampScore(linear(f.fcfYield, 0.02, 0.1, 35, 88));
  // Bonus voor solid netMargin (zegt iets over earnings-quality).
  let bonus = 0;
  const inputsUsed = ["fcfYield"];
  const inputsMissing: string[] = [];
  if (typeof f.netMargin === "number") {
    inputsUsed.push("netMargin");
    if (f.netMargin >= 0.15) bonus += 8;
    else if (f.netMargin <= 0.05) bonus -= 8;
  } else {
    inputsMissing.push("netMargin");
  }

  const score = clampScore(baseScore + bonus);
  const rationale =
    score >= 75
      ? `Owner-earnings-proxy sterk (FCF-yield ${pct(f.fcfYield)}) met solide marges — Buffett-laag positief.`
      : score >= 50
        ? `Owner-earnings acceptabel (FCF-yield ${pct(f.fcfYield)}) — kasstroom dekt resultaat.`
        : `Owner-earnings beperkt — FCF (${pct(f.fcfYield)}) en/of marges zijn dun.`;

  return { key, label, score, weight, rationale, inputsUsed, inputsMissing, metric: f.fcfYield };
}

function buildMarginStability(
  f: FundamentalsSnapshot | null,
): MoatComponent {
  const key: MoatComponentKey = "margin_stability";
  const label = COMPONENT_LABELS[key];
  const weight = COMPONENT_WEIGHTS[key];

  // Yahoo levert geen historische marge-tijdreeks. Proxy:
  // hoge marges + lage debt-to-equity ≈ stabiele winstgevendheid.
  // Conservatief: alleen scoren als minimaal grossMargin OF operatingMargin
  // beschikbaar is.
  if (!f) return missingComponent(key, label, weight, ["grossMargin", "operatingMargin"]);

  const gm = typeof f.grossMargin === "number" ? f.grossMargin : null;
  const om = typeof f.operatingMargin === "number" ? f.operatingMargin : null;
  if (gm === null && om === null) {
    return missingComponent(key, label, weight, ["grossMargin", "operatingMargin"]);
  }

  const inputsUsed: string[] = [];
  const inputsMissing: string[] = [];
  const scores: number[] = [];

  if (gm !== null) {
    inputsUsed.push("grossMargin");
    // GM 15% → 30, 40% → 70, 60% → 85.
    scores.push(clampScore(linear(gm, 0.15, 0.6, 30, 85)));
  } else {
    inputsMissing.push("grossMargin");
  }
  if (om !== null) {
    inputsUsed.push("operatingMargin");
    // OM 5% → 30, 15% → 65, 30% → 85.
    scores.push(clampScore(linear(om, 0.05, 0.3, 30, 85)));
  } else {
    inputsMissing.push("operatingMargin");
  }

  const score = Math.round(scores.reduce((s, x) => s + x, 0) / scores.length);
  const rationale =
    score >= 70
      ? `Sterke marges (gross ${gm ? pct(gm) : "—"}, operating ${om ? pct(om) : "—"}) — wijst op pricing power of kostenefficiëntie.`
      : score <= 40
        ? `Lage marges — commoditiserings-risico of kostendruk.`
        : `Marges gemiddeld — neutraal moat-signaal.`;

  return { key, label, score, weight, rationale, inputsUsed, inputsMissing, metric: om ?? gm };
}

function buildEarningsGrowthQuality(
  f: FundamentalsSnapshot | null,
): MoatComponent {
  const key: MoatComponentKey = "earnings_growth_quality";
  const label = COMPONENT_LABELS[key];
  const weight = COMPONENT_WEIGHTS[key];

  if (!f) return missingComponent(key, label, weight, ["epsGrowth5y", "revenueGrowth5y"]);

  const eg5 = typeof f.epsGrowth5y === "number" ? f.epsGrowth5y : null;
  const rg5 = typeof f.revenueGrowth5y === "number" ? f.revenueGrowth5y : null;
  if (eg5 === null && rg5 === null) {
    return missingComponent(key, label, weight, ["epsGrowth5y", "revenueGrowth5y"]);
  }

  const inputsUsed: string[] = [];
  const inputsMissing: string[] = [];
  const scores: number[] = [];

  if (eg5 !== null) {
    inputsUsed.push("epsGrowth5y");
    // EPS-growth -5% → 20, 5% → 55, 15% → 80, 25%+ → 90.
    if (eg5 <= -0.05) scores.push(20);
    else if (eg5 <= 0.05) scores.push(clampScore(linear(eg5, -0.05, 0.05, 20, 55)));
    else if (eg5 <= 0.15) scores.push(clampScore(linear(eg5, 0.05, 0.15, 55, 80)));
    else scores.push(clampScore(linear(eg5, 0.15, 0.25, 80, 90)));
  } else {
    inputsMissing.push("epsGrowth5y");
  }
  if (rg5 !== null) {
    inputsUsed.push("revenueGrowth5y");
    if (rg5 <= -0.02) scores.push(25);
    else if (rg5 <= 0.05) scores.push(clampScore(linear(rg5, -0.02, 0.05, 25, 55)));
    else if (rg5 <= 0.15) scores.push(clampScore(linear(rg5, 0.05, 0.15, 55, 80)));
    else scores.push(clampScore(linear(rg5, 0.15, 0.25, 80, 88)));
  } else {
    inputsMissing.push("revenueGrowth5y");
  }

  const score = Math.round(scores.reduce((s, x) => s + x, 0) / scores.length);
  const rationale =
    score >= 70
      ? `Solide groei (${eg5 !== null ? `EPS ${pct(eg5)}/jr` : ""}${eg5 !== null && rg5 !== null ? ", " : ""}${rg5 !== null ? `omzet ${pct(rg5)}/jr` : ""}) — duurzaam moat-signaal.`
      : score <= 40
        ? `Zwakke of negatieve groei — moat staat onder druk.`
        : `Groei gemiddeld — neutraal.`;

  return { key, label, score, weight, rationale, inputsUsed, inputsMissing, metric: eg5 ?? rg5 };
}

function buildDebtSustainability(
  f: FundamentalsSnapshot | null,
): MoatComponent {
  const key: MoatComponentKey = "debt_sustainability";
  const label = COMPONENT_LABELS[key];
  const weight = COMPONENT_WEIGHTS[key];

  if (!f) return missingComponent(key, label, weight, ["debtToEquity", "interestCoverage"]);

  const de = typeof f.debtToEquity === "number" ? f.debtToEquity : null;
  const ic = typeof f.interestCoverage === "number" ? f.interestCoverage : null;
  if (de === null && ic === null) {
    return missingComponent(key, label, weight, ["debtToEquity", "interestCoverage"]);
  }

  const inputsUsed: string[] = [];
  const inputsMissing: string[] = [];
  const scores: number[] = [];

  if (de !== null) {
    inputsUsed.push("debtToEquity");
    // D/E 0 → 90, 0.5 → 75, 1 → 55, 1.5 → 35, 2.5+ → 15.
    if (de <= 0) scores.push(90);
    else if (de <= 0.5) scores.push(clampScore(linear(de, 0, 0.5, 90, 75)));
    else if (de <= 1) scores.push(clampScore(linear(de, 0.5, 1, 75, 55)));
    else if (de <= 1.5) scores.push(clampScore(linear(de, 1, 1.5, 55, 35)));
    else scores.push(clampScore(linear(de, 1.5, 2.5, 35, 15)));
  } else {
    inputsMissing.push("debtToEquity");
  }
  if (ic !== null) {
    inputsUsed.push("interestCoverage");
    // IC <1 → 15, 3 → 50, 8 → 75, 15+ → 90.
    if (ic <= 1) scores.push(15);
    else if (ic <= 3) scores.push(clampScore(linear(ic, 1, 3, 15, 50)));
    else if (ic <= 8) scores.push(clampScore(linear(ic, 3, 8, 50, 75)));
    else scores.push(clampScore(linear(ic, 8, 15, 75, 90)));
  } else {
    inputsMissing.push("interestCoverage");
  }

  const score = Math.round(scores.reduce((s, x) => s + x, 0) / scores.length);
  const rationale =
    score >= 70
      ? `Solide balans (D/E ${de !== null ? de.toFixed(2) : "—"}${ic !== null ? `, rentedekking ${ic.toFixed(1)}x` : ""}).`
      : score <= 40
        ? `Zwakke balanskwaliteit — hoge schuld of krappe rentedekking. Risico bij stijgende rente.`
        : `Schuldpositie gemiddeld — let op rente-omgeving.`;

  return { key, label, score, weight, rationale, inputsUsed, inputsMissing, metric: de };
}

function buildDividendSafety(
  f: FundamentalsSnapshot | null,
  hasDividend: boolean,
): MoatComponent {
  const key: MoatComponentKey = "dividend_safety";
  const label = COMPONENT_LABELS[key];
  const weight = COMPONENT_WEIGHTS[key];

  if (!hasDividend || !f || typeof f.dividendYield !== "number" || f.dividendYield <= 0) {
    return {
      key,
      label,
      score: null,
      weight,
      rationale: "Geen dividend — niet relevant voor deze asset (component overgeslagen).",
      inputsUsed: [],
      inputsMissing: ["dividendYield", "payoutRatio", "dividendGrowth5y"],
    };
  }

  const py = typeof f.payoutRatio === "number" ? f.payoutRatio : null;
  const dg5 = typeof f.dividendGrowth5y === "number" ? f.dividendGrowth5y : null;

  if (py === null && dg5 === null) {
    return missingComponent(key, label, weight, ["payoutRatio", "dividendGrowth5y"]);
  }

  const inputsUsed: string[] = ["dividendYield"];
  const inputsMissing: string[] = [];
  const scores: number[] = [];

  if (py !== null) {
    inputsUsed.push("payoutRatio");
    // Payout 0..30% → 90, 30-60% → 75, 60-80% → 55, 80-100% → 30, >100% → 10.
    if (py <= 0.3) scores.push(90);
    else if (py <= 0.6) scores.push(clampScore(linear(py, 0.3, 0.6, 90, 75)));
    else if (py <= 0.8) scores.push(clampScore(linear(py, 0.6, 0.8, 75, 55)));
    else if (py <= 1.0) scores.push(clampScore(linear(py, 0.8, 1.0, 55, 30)));
    else scores.push(10);
  } else {
    inputsMissing.push("payoutRatio");
  }
  if (dg5 !== null) {
    inputsUsed.push("dividendGrowth5y");
    if (dg5 < 0) scores.push(25);
    else if (dg5 <= 0.02) scores.push(clampScore(linear(dg5, 0, 0.02, 40, 55)));
    else if (dg5 <= 0.08) scores.push(clampScore(linear(dg5, 0.02, 0.08, 55, 80)));
    else scores.push(85);
  } else {
    inputsMissing.push("dividendGrowth5y");
  }

  const score = Math.round(scores.reduce((s, x) => s + x, 0) / scores.length);
  const rationale =
    score >= 70
      ? `Dividend lijkt veilig — payout-ratio ${py !== null ? pct(py) : "—"} en groei ${dg5 !== null ? pct(dg5) : "—"}.`
      : score <= 40
        ? `Dividend-veiligheid beperkt — hoge payout of krimpend dividend.`
        : `Dividend acceptabel — neutraal signaal.`;

  return { key, label, score, weight, rationale, inputsUsed, inputsMissing, metric: py };
}

function buildPricingPower(f: FundamentalsSnapshot | null): MoatComponent {
  const key: MoatComponentKey = "pricing_power";
  const label = COMPONENT_LABELS[key];
  const weight = COMPONENT_WEIGHTS[key];

  // Pricing power proxy: hoge bruto-marge gecombineerd met stable operating-margin.
  // We hebben geen prijsindex-time-series; pure-margin-proxy.
  if (!f || (typeof f.grossMargin !== "number" && typeof f.operatingMargin !== "number")) {
    return missingComponent(key, label, weight, ["grossMargin", "operatingMargin"]);
  }

  const gm = typeof f.grossMargin === "number" ? f.grossMargin : null;
  const om = typeof f.operatingMargin === "number" ? f.operatingMargin : null;

  let score: number;
  const inputsUsed: string[] = [];
  if (gm !== null && gm >= 0.5) {
    inputsUsed.push("grossMargin");
    score = clampScore(linear(gm, 0.5, 0.7, 65, 88));
  } else if (gm !== null && gm >= 0.3) {
    inputsUsed.push("grossMargin");
    score = clampScore(linear(gm, 0.3, 0.5, 45, 65));
  } else if (gm !== null) {
    inputsUsed.push("grossMargin");
    score = clampScore(linear(gm, 0.1, 0.3, 25, 45));
  } else if (om !== null && om >= 0.2) {
    inputsUsed.push("operatingMargin");
    score = clampScore(linear(om, 0.2, 0.35, 60, 80));
  } else if (om !== null) {
    inputsUsed.push("operatingMargin");
    score = clampScore(linear(om, 0.05, 0.2, 30, 60));
  } else {
    return missingComponent(key, label, weight, ["grossMargin", "operatingMargin"]);
  }

  const rationale =
    score >= 70
      ? `Sterke marges (${gm !== null ? `bruto ${pct(gm)}` : `operating ${pct(om!)}`}) — wijst op pricing power.`
      : score <= 40
        ? `Lage marges — beperkte pricing power, gevoelig voor concurrentie.`
        : `Marges gemiddeld — neutrale pricing power.`;

  const inputsMissing: string[] = [];
  if (gm === null) inputsMissing.push("grossMargin");
  if (om === null) inputsMissing.push("operatingMargin");

  return { key, label, score, weight, rationale, inputsUsed, inputsMissing, metric: gm ?? om };
}

function buildMoatConfidence(
  f: FundamentalsSnapshot | null,
): MoatComponent {
  const key: MoatComponentKey = "moat_confidence";
  const label = COMPONENT_LABELS[key];
  const weight = COMPONENT_WEIGHTS[key];

  // Moat-confidence: combinatie ROIC > 15% + lage D/E + brede marges
  // = classic moat-pattern.
  if (!f) return missingComponent(key, label, weight, ["roic", "debtToEquity", "grossMargin"]);

  const conditions: Array<{ name: string; pass: boolean; weight: number }> = [
    {
      name: "roic_high",
      pass: typeof f.roic === "number" && f.roic >= 0.15,
      weight: 35,
    },
    {
      name: "debt_low",
      pass: typeof f.debtToEquity === "number" && f.debtToEquity <= 0.6,
      weight: 25,
    },
    {
      name: "gross_margin_high",
      pass: typeof f.grossMargin === "number" && f.grossMargin >= 0.4,
      weight: 20,
    },
    {
      name: "fcf_positive",
      pass: typeof f.fcfYield === "number" && f.fcfYield > 0.03,
      weight: 20,
    },
  ];

  const measurable = conditions.filter(
    (c) =>
      (c.name === "roic_high" && typeof f.roic === "number") ||
      (c.name === "debt_low" && typeof f.debtToEquity === "number") ||
      (c.name === "gross_margin_high" && typeof f.grossMargin === "number") ||
      (c.name === "fcf_positive" && typeof f.fcfYield === "number"),
  );
  if (measurable.length === 0) {
    return missingComponent(key, label, weight, conditions.map((c) => c.name));
  }

  const measurableTotal = measurable.reduce((s, c) => s + c.weight, 0);
  const passedWeight = measurable
    .filter((c) => c.pass)
    .reduce((s, c) => s + c.weight, 0);
  // Score: 30 (geen passes) tot 90 (alle passes).
  const score =
    measurableTotal > 0
      ? Math.round(30 + (passedWeight / measurableTotal) * 60)
      : null;

  const inputsUsed: string[] = [];
  if (typeof f.roic === "number") inputsUsed.push("roic");
  if (typeof f.debtToEquity === "number") inputsUsed.push("debtToEquity");
  if (typeof f.grossMargin === "number") inputsUsed.push("grossMargin");
  if (typeof f.fcfYield === "number") inputsUsed.push("fcfYield");

  const inputsMissing: string[] = [];
  if (typeof f.roic !== "number") inputsMissing.push("roic");
  if (typeof f.debtToEquity !== "number") inputsMissing.push("debtToEquity");
  if (typeof f.grossMargin !== "number") inputsMissing.push("grossMargin");
  if (typeof f.fcfYield !== "number") inputsMissing.push("fcfYield");

  const passCount = measurable.filter((c) => c.pass).length;
  const rationale =
    score === null
      ? "Onvoldoende data voor moat-pattern-check."
      : passCount >= 3
        ? `Moat-pattern-confidence hoog (${passCount}/${measurable.length} kenmerken aanwezig).`
        : passCount === 0
          ? `Geen klassieke moat-kenmerken zichtbaar — vermoedelijk geen brede moat.`
          : `Moat-pattern deels aanwezig (${passCount}/${measurable.length}).`;

  return { key, label, score, weight, rationale, inputsUsed, inputsMissing };
}

function buildDataCoverage(f: FundamentalsSnapshot | null): MoatComponent {
  const key: MoatComponentKey = "data_coverage";
  const label = COMPONENT_LABELS[key];
  const weight = COMPONENT_WEIGHTS[key];

  // Tel hoeveel kern-velden gevuld zijn.
  const fields = [
    "roic",
    "roe",
    "fcfYield",
    "debtToEquity",
    "interestCoverage",
    "grossMargin",
    "operatingMargin",
    "netMargin",
    "epsGrowth5y",
    "revenueGrowth5y",
    "dividendYield",
    "payoutRatio",
  ] as const;
  if (!f) {
    return {
      key,
      label,
      score: 5,
      weight,
      rationale: "Geen fundamentals beschikbaar — moat-analyse zeer beperkt.",
      inputsUsed: [],
      inputsMissing: [...fields],
    };
  }
  const present = fields.filter(
    (k) => typeof f[k] === "number" && Number.isFinite(f[k] as number),
  );
  const missing = fields.filter((k) => !present.includes(k));
  const ratio = present.length / fields.length;
  const score = Math.round(ratio * 100);
  const rationale =
    score >= 80
      ? "Datadekking sterk — bijna alle quality-indicatoren beschikbaar."
      : score >= 50
        ? `Datadekking gemiddeld — ${present.length}/${fields.length} velden aanwezig.`
        : `Datadekking beperkt (${present.length}/${fields.length}) — conclusies blijven indicatief.`;

  return {
    key,
    label,
    score,
    weight,
    rationale,
    inputsUsed: [...present],
    inputsMissing: [...missing],
  };
}

// ============================================================
//  Helpers
// ============================================================

function missingComponent(
  key: MoatComponentKey,
  label: string,
  weight: number,
  requiredFields: ReadonlyArray<string>,
): MoatComponent {
  return {
    key,
    label,
    score: null,
    weight,
    rationale: `Geen score: ${requiredFields.join(", ")} ontbreekt in fundamentals.`,
    inputsUsed: [],
    inputsMissing: [...requiredFields],
  };
}

function buildWarnings(
  components: ReadonlyArray<MoatComponent>,
  coverage: number,
): string[] {
  const out: string[] = [];

  if (coverage < 0.4) {
    out.push(
      "Datadekking is te laag voor een betrouwbaar moat-oordeel — composite is opgeschort.",
    );
  } else if (coverage < 0.6) {
    out.push(
      `Datadekking beperkt (${Math.round(coverage * 100)}%) — composite is indicatief.`,
    );
  }

  // Risicoanalist-laag: balansrisico's expliciet.
  const debt = components.find((c) => c.key === "debt_sustainability");
  if (debt && debt.score !== null && debt.score <= 40) {
    out.push(
      "Balanskwaliteit zwak — hoge schuld of krappe rentedekking. Rente-stijging is een directe bedreiging.",
    );
  }

  const fcf = components.find((c) => c.key === "fcf_quality");
  if (fcf && fcf.score !== null && fcf.score <= 35) {
    out.push(
      "Free cash flow zwak — winsten zijn mogelijk niet duurzaam zonder cash-conversie.",
    );
  }

  const ownerEarnings = components.find((c) => c.key === "owner_earnings");
  if (ownerEarnings && ownerEarnings.score !== null && ownerEarnings.score <= 30) {
    out.push(
      "Owner-earnings proxy is negatief — kritiek signaal voor langetermijn-bezit.",
    );
  }

  return out;
}

function buildHeadline(
  grade: MoatReport["grade"],
  composite: number | null,
  components: ReadonlyArray<MoatComponent>,
): string {
  if (composite === null || grade === "unknown") {
    return "Onvoldoende data voor een moat-oordeel.";
  }

  const labelMap: Record<MoatReport["grade"], string> = {
    wide: "Brede moat",
    narrow: "Smalle moat",
    neutral: "Neutraal",
    weak: "Zwakke moat",
    unknown: "Onbekend",
  };

  const top = components
    .filter((c) => c.score !== null)
    .slice()
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

  if (top) {
    return `${labelMap[grade]} (${composite}/100). Sterkste signaal: ${top.label.toLowerCase()}.`;
  }
  return `${labelMap[grade]} (${composite}/100).`;
}

function linear(
  value: number,
  inLow: number,
  inHigh: number,
  outLow: number,
  outHigh: number,
): number {
  if (inHigh === inLow) return outLow;
  const t = (value - inLow) / (inHigh - inLow);
  return outLow + t * (outHigh - outLow);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 50;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

function pct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}
