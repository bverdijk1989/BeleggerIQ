/**
 * Moat & Owner Earnings Engine — types (Module 32).
 *
 * Buffett-laag: beoordeel of een aandeel kwalitatief sterk genoeg is voor
 * langetermijnbezit. 10 sub-componenten, elk apart gemeten.
 *
 * **Conservatieve defaults**:
 *  - GEEN nep-score 50 bij ontbrekende data — component krijgt
 *    `score: null` en wordt uitgesloten van het gewogen gemiddelde
 *  - Confidence = gewogen-coverage van aanwezige componenten
 *  - Bij coverage < 0.4 → confidence = "low" + UI rendert waarschuwing
 *
 * **Owner Earnings (Buffett 1986 letter)**:
 *  E = Net Income + DepreciationAmortization - MaintCapEx - WorkingCapitalChange
 *  We hebben in Yahoo geen split tussen maint vs growth capex; proxy via
 *  FCF (= CFO - CapEx) gecorrigeerd voor non-cash. Conservatief: pure FCF-
 *  yield + groei consistency.
 */

import type { ISODateString } from "@/types/common";

/** 10 vaste componenten uit spec. */
export type MoatComponentKey =
  | "fcf_quality"
  | "return_on_capital"
  | "debt_sustainability"
  | "margin_stability"
  | "earnings_growth_quality"
  | "dividend_safety"
  | "pricing_power"
  | "owner_earnings"
  | "moat_confidence"
  | "data_coverage";

export type MoatGrade = "wide" | "narrow" | "neutral" | "weak" | "unknown";

/** Een sub-component score. */
export interface MoatComponent {
  key: MoatComponentKey;
  /** UI-label NL. */
  label: string;
  /** 0..100, hoger = sterker. null = onvoldoende data. */
  score: number | null;
  /** Gewicht in composite (som van scored = 1.0 herverdeeld). */
  weight: number;
  /** Plain-language uitleg met concrete cijfers. */
  rationale: string;
  /** Welke fundamentele velden zijn benut. */
  inputsUsed: ReadonlyArray<string>;
  /** Welke velden ontbraken (voor data-coverage card). */
  inputsMissing: ReadonlyArray<string>;
  /** Optionele ratio-waarde voor display ("ROIC 18.4%"). */
  metric?: number | null;
}

/**
 * Volledig rapport per asset.
 */
export interface MoatReport {
  ticker: string;
  asOf: ISODateString;
  /** Composite 0..100. null wanneer coverage te laag is. */
  compositeScore: number | null;
  /** Letter-grade (wide/narrow/neutral/weak/unknown). */
  grade: MoatGrade;
  /** Coverage 0..1 — fractie van weight dat data leverde. */
  coverage: number;
  /** Confidence-tier afgeleid van coverage. */
  confidence: "high" | "medium" | "low" | "insufficient";
  /** Per-component breakdown — exact 10 in vaste volgorde. */
  components: ReadonlyArray<MoatComponent>;
  /** 1-zin headline ("Sterke moat: ROIC 22%, lage schuld"). */
  headline: string;
  /** Lijst beperkingen — risicoanalist-vriendelijk. */
  warnings: ReadonlyArray<string>;
  /** Verplichte disclaimer. */
  disclaimer: string;
}

/** UI-labels per component (NL). */
export const COMPONENT_LABELS: Record<MoatComponentKey, string> = {
  fcf_quality: "Free Cash Flow-kwaliteit",
  return_on_capital: "Rendement op kapitaal",
  debt_sustainability: "Schuldhoudbaarheid",
  margin_stability: "Margestabiliteit",
  earnings_growth_quality: "Winstgroei-kwaliteit",
  dividend_safety: "Dividendveiligheid",
  pricing_power: "Pricing power",
  owner_earnings: "Owner Earnings (Buffett-proxy)",
  moat_confidence: "Moat-confidence",
  data_coverage: "Datadekking",
};

/** Vaste volgorde — UI rendert in deze sequence. */
export const COMPONENT_ORDER: ReadonlyArray<MoatComponentKey> = [
  "return_on_capital",
  "fcf_quality",
  "owner_earnings",
  "margin_stability",
  "earnings_growth_quality",
  "debt_sustainability",
  "dividend_safety",
  "pricing_power",
  "moat_confidence",
  "data_coverage",
];

/**
 * Gewichten per component — som = 1.0. Buffett-bias: return-on-capital +
 * FCF-quality + owner-earnings samen 50%.
 */
export const COMPONENT_WEIGHTS: Record<MoatComponentKey, number> = {
  return_on_capital: 0.20,
  fcf_quality: 0.15,
  owner_earnings: 0.15,
  margin_stability: 0.10,
  earnings_growth_quality: 0.10,
  debt_sustainability: 0.10,
  dividend_safety: 0.05,
  pricing_power: 0.05,
  moat_confidence: 0.05,
  data_coverage: 0.05,
};

/** Grade-thresholds. */
export function gradeFromScore(score: number | null, coverage: number): MoatGrade {
  if (score === null || coverage < 0.4) return "unknown";
  if (score >= 80) return "wide";
  if (score >= 65) return "narrow";
  if (score >= 45) return "neutral";
  return "weak";
}

/** Verplichte disclaimer onder rapport. */
export const MOAT_DISCLAIMER =
  "De moat-score is een kwalitatieve indicatie op basis van fundamentele ratio's. Een hoge score garandeert geen koerswinst; een lage score is geen verkoop-signaal. Buffett's moat-concept vereist ook kwalitatieve overwegingen (merk, schaal, switching costs) die wij niet meten. Gebruik dit als startpunt voor eigen onderzoek.";
