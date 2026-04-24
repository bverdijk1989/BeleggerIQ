import { deriveStrengthsWeaknesses } from "@/lib/analytics/screener";
import { classifyInstrument } from "@/lib/analytics/instruments/classifier";
import type { FactorScore, FundamentalsSnapshot } from "@/types/factor";
import type { ISODateString } from "@/types/common";
import type { Holding } from "@/types/portfolio";
import type {
  MispricingSignal,
  MispricingCandidate,
} from "@/lib/analytics/mispricing";
import type { OpportunityCandidate } from "@/lib/analytics/opportunity-radar";
import type { HoldingValuation } from "@/lib/analytics/valuation";
import type { RebalanceRecommendation } from "@/types/rebalance";

/**
 * AI Research Dossier — engine voor het genereren van compacte, NL
 * research-dossiers per ticker.
 *
 * Architectuur in twee lagen:
 *
 *   1. **buildResearchContext** — pure data-extractor. Verzamelt ALLE
 *      cijfers en kwalitatieve outputs uit bestaande engines (factor,
 *      fundamentals, classifier, mispricing-scanner, opportunity-radar,
 *      rebalance) in één gestructureerd object. Geen AI, geen
 *      verzonnen waarden, geen ranking-overschrijvingen.
 *
 *   2. **renderResearchDossier** — deterministische renderer. Bouwt
 *      thesis / bull / bear / risico's / checklist uit de context met
 *      vaste templates. Als later een LLM-laag wordt toegevoegd, mag
 *      die ALLEEN de bullet-strings herformuleren — nooit cijfers
 *      veranderen of toevoegen.
 *
 * Guardrails (afgedwongen door het type-systeem + tests):
 *   - Elk veld dat een getal/percentage bevat, komt uit
 *     `context.keyMetrics` (een onveranderlijke lijst van
 *     `ResearchMetric` waarvan elke `value` al een geformatteerde
 *     string is).
 *   - De renderer kent geen `Math.round` van factor-scores; die
 *     worden letterlijk overgenomen.
 *   - Onzekerheid (LOW confidence, missende fundamentals, geen
 *     factor-scores) verschijnt in `dossier.uncertainty` en
 *     `dossier.missingData`.
 *
 * Dit document is server-side only — geen `prisma`-import zodat de
 * engine ook in unit tests gebruikt kan worden zonder DB-mock.
 */

// ============================================================
//  Types
// ============================================================

export type ResearchSource =
  | "factor-engine"
  | "fundamentals"
  | "classifier"
  | "rebalance-engine"
  | "mispricing-scanner"
  | "opportunity-radar";

/**
 * Een enkel kerncijfer dat in het dossier verschijnt. `value` is
 * **al pre-formatted** (bv. "P/E 14.2", "Quality 78/100", "FCF-yield
 * 6.5%") zodat de renderer geen rekenwerk doet en geen extra cijfers
 * kan introduceren.
 */
export interface ResearchMetric {
  label: string;
  value: string;
  helper?: string;
  source: ResearchSource;
  asOf?: ISODateString | null;
}

/**
 * Een evidence-bullet (bull/bear/risk). De tekst komt rechtstreeks
 * uit een engine `rationale[]` of factor-strength. Niets wordt
 * geparafraseerd op getalniveau.
 */
export interface ResearchEvidencePoint {
  source: ResearchSource;
  text: string;
}

export interface ResearchUncertainty {
  /** 0..1 — hoe stevig de evidence is. Hoger = meer hard data. */
  confidence: number;
  /** Korte NL-zin die de tier uitlegt. */
  note: string;
  /** Wat ontbreekt? Genoemd in de UI onder "Ontbrekende data". */
  missingData: string[];
}

export interface ResearchContext {
  ticker: string;
  name: string | null;
  generatedAt: ISODateString;

  factorScore: FactorScore | null;
  fundamentals: FundamentalsSnapshot | null;
  /** Holding info indien de ticker in de portefeuille zit. */
  holding: Holding | null;
  valuation: HoldingValuation | null;
  /** Rebalance-recommendation voor portefeuille-tickers. */
  rebalance: RebalanceRecommendation | null;
  /** Mispricing-kandidaat (één per ticker, of null). */
  mispricing: MispricingCandidate | null;
  /** Opportunity-radar kandidaat. */
  opportunity: OpportunityCandidate | null;

  keyMetrics: ResearchMetric[];
  bullPoints: ResearchEvidencePoint[];
  bearPoints: ResearchEvidencePoint[];
  riskPoints: ResearchEvidencePoint[];

  uncertainty: ResearchUncertainty;
  /** Welke engines hebben bijgedragen — voor audit-trail in de UI. */
  sourceEngines: ResearchSource[];
}

export interface ResearchDossier {
  ticker: string;
  name: string | null;
  generatedAt: ISODateString;

  /** 1-3 zinnen NL prozza. Volledig opgebouwd uit context-getallen. */
  thesis: string;
  bullCase: string[];
  bearCase: string[];
  /** Direct uit context.keyMetrics — UI kan ze 1:1 renderen. */
  keyNumbers: ResearchMetric[];
  /** Direct uit context.uncertainty.missingData. */
  missingData: string[];
  /** Risico-bullets (uit context.riskPoints + classifier-warnings). */
  risks: string[];
  /** Vragen die de gebruiker zelf moet beantwoorden vóór het besluit. */
  decisionChecklist: string[];

  uncertaintyNote: string;
  confidence: number;

  sourceEngines: ResearchSource[];
}

// ============================================================
//  Public input shape
// ============================================================

export interface BuildResearchContextInput {
  ticker: string;
  name?: string | null;
  factorScore?: FactorScore | null;
  fundamentals?: FundamentalsSnapshot | null;
  holding?: Holding | null;
  valuation?: HoldingValuation | null;
  rebalance?: RebalanceRecommendation | null;
  mispricing?: MispricingCandidate | null;
  opportunity?: OpportunityCandidate | null;
  /** Override voor deterministische tests; default `new Date()`. */
  now?: string;
}

// ============================================================
//  Context-builder (pure, geen AI)
// ============================================================

export function buildResearchContext(
  input: BuildResearchContextInput,
): ResearchContext {
  const generatedAt = input.now ?? new Date().toISOString();
  const ticker = input.ticker.trim().toUpperCase();
  const name =
    input.name ?? input.holding?.name ?? input.valuation?.holding.name ?? null;
  const factorScore = input.factorScore ?? null;
  const fundamentals = input.fundamentals ?? null;
  const holding = input.holding ?? input.valuation?.holding ?? null;
  const valuation = input.valuation ?? null;
  const rebalance = input.rebalance ?? null;
  const mispricing = input.mispricing ?? null;
  const opportunity = input.opportunity ?? null;

  // --- Key metrics ---
  const keyMetrics = collectKeyMetrics({
    factorScore,
    fundamentals,
    valuation,
    mispricing,
    opportunity,
  });

  // --- Bull / bear / risks ---
  const bullPoints: ResearchEvidencePoint[] = [];
  const bearPoints: ResearchEvidencePoint[] = [];
  const riskPoints: ResearchEvidencePoint[] = [];

  if (factorScore) {
    const { strengths, weaknesses } = deriveStrengthsWeaknesses(factorScore);
    for (const s of strengths) {
      bullPoints.push({ source: "factor-engine", text: s });
    }
    for (const w of weaknesses) {
      bearPoints.push({ source: "factor-engine", text: w });
    }
  }

  if (opportunity) {
    for (const sig of opportunity.signals) {
      // Rationales komen letterlijk uit de engine.
      for (const r of sig.rationale) {
        bullPoints.push({ source: "opportunity-radar", text: r });
      }
      if (sig.riskNote) {
        riskPoints.push({ source: "opportunity-radar", text: sig.riskNote });
      }
    }
  }

  if (mispricing) {
    for (const sig of mispricing.signals) {
      const sigBucket: ResearchEvidencePoint[] =
        sig.type === "valuation-gap" || sig.type === "quality-price-divergence"
          ? bullPoints
          : bearPoints;
      for (const r of sig.rationale) {
        sigBucket.push({ source: "mispricing-scanner", text: r });
      }
      if (sig.riskNote) {
        riskPoints.push({ source: "mispricing-scanner", text: sig.riskNote });
      }
    }
    for (const flag of mispricing.riskFlagCodes) {
      riskPoints.push({
        source: "mispricing-scanner",
        text: explainMispricingFlag(flag),
      });
    }
  }

  if (rebalance && rebalance.action !== "NO_ACTION") {
    for (const reason of rebalance.reasons) {
      bearPoints.push({ source: "rebalance-engine", text: reason });
    }
  }

  // Classifier-waarschuwingen (bv. crypto/speculative/illiquid)
  if (holding) {
    const classification = classifyInstrument({
      holding,
      enrichment: null,
    });
    if (classification.metadata.isSpeculative) {
      riskPoints.push({
        source: "classifier",
        text: "Instrument is geclassificeerd als speculatief — verhoogde volatiliteit en blow-up-risico.",
      });
    }
    if (classification.confidence === "LOW") {
      riskPoints.push({
        source: "classifier",
        text: "Classificatie is met lage zekerheid bepaald; controleer fonds-prospectus of factsheet.",
      });
    }
  }

  // --- Uncertainty ---
  const missingData: string[] = [];
  if (!factorScore) missingData.push("factor-scores");
  if (!fundamentals) missingData.push("fundamentals");
  if (factorScore && (factorScore.confidence ?? 0) < 0.4) {
    missingData.push("factor-confidence (< 0.4)");
  }
  if (mispricing === null && opportunity === null) {
    missingData.push("mispricing- en radar-signalen");
  }
  if (!holding) missingData.push("portefeuille-context (positie ontbreekt)");

  const confidence = computeConfidence({
    factorScore,
    fundamentals,
    holding,
    mispricing,
    opportunity,
  });

  const uncertainty: ResearchUncertainty = {
    confidence,
    note: confidenceNote(confidence, missingData.length),
    missingData,
  };

  // --- Source-engines audit-trail ---
  const sourceEngines: ResearchSource[] = [];
  if (factorScore) sourceEngines.push("factor-engine");
  if (fundamentals) sourceEngines.push("fundamentals");
  if (holding) sourceEngines.push("classifier");
  if (rebalance) sourceEngines.push("rebalance-engine");
  if (mispricing) sourceEngines.push("mispricing-scanner");
  if (opportunity) sourceEngines.push("opportunity-radar");

  return {
    ticker,
    name,
    generatedAt,
    factorScore,
    fundamentals,
    holding,
    valuation,
    rebalance,
    mispricing,
    opportunity,
    keyMetrics,
    bullPoints: dedupePoints(bullPoints),
    bearPoints: dedupePoints(bearPoints),
    riskPoints: dedupePoints(riskPoints),
    uncertainty,
    sourceEngines,
  };
}

// ============================================================
//  Dossier-renderer (pure, deterministisch)
// ============================================================

export function renderResearchDossier(
  context: ResearchContext,
): ResearchDossier {
  const thesis = buildThesis(context);

  const bullCase = context.bullPoints.slice(0, 6).map((p) => p.text);
  const bearCase = context.bearPoints.slice(0, 6).map((p) => p.text);
  const risks = context.riskPoints.slice(0, 6).map((p) => p.text);

  const decisionChecklist = buildChecklist(context);

  return {
    ticker: context.ticker,
    name: context.name,
    generatedAt: context.generatedAt,
    thesis,
    bullCase,
    bearCase,
    keyNumbers: context.keyMetrics,
    missingData: context.uncertainty.missingData,
    risks,
    decisionChecklist,
    uncertaintyNote: context.uncertainty.note,
    confidence: context.uncertainty.confidence,
    sourceEngines: context.sourceEngines,
  };
}

/**
 * One-shot helper: input → context → dossier. Handig voor de API-route.
 */
export function buildResearchDossier(
  input: BuildResearchContextInput,
): ResearchDossier {
  const context = buildResearchContext(input);
  return renderResearchDossier(context);
}

// ============================================================
//  Key-metric collector
// ============================================================

interface CollectMetricsInput {
  factorScore: FactorScore | null;
  fundamentals: FundamentalsSnapshot | null;
  valuation: HoldingValuation | null;
  mispricing: MispricingCandidate | null;
  opportunity: OpportunityCandidate | null;
}

function collectKeyMetrics(input: CollectMetricsInput): ResearchMetric[] {
  const out: ResearchMetric[] = [];

  if (input.factorScore) {
    const fs = input.factorScore;
    out.push({
      label: "Composite",
      value: `${Math.round(fs.composite)}/100`,
      source: "factor-engine",
      asOf: fs.asOf,
    });
    out.push({
      label: "Quality",
      value: `${Math.round(fs.subScores.quality)}/100`,
      source: "factor-engine",
    });
    out.push({
      label: "Value",
      value: `${Math.round(fs.subScores.value)}/100`,
      source: "factor-engine",
    });
    out.push({
      label: "Momentum",
      value: `${Math.round(fs.subScores.momentum)}/100`,
      source: "factor-engine",
    });
    out.push({
      label: "LowVol",
      value: `${Math.round(fs.subScores.lowVol)}/100`,
      source: "factor-engine",
    });
    if (typeof fs.confidence === "number") {
      out.push({
        label: "Factor-confidence",
        value: `${(fs.confidence * 100).toFixed(0)}%`,
        source: "factor-engine",
      });
    }
  }

  if (input.fundamentals) {
    const f = input.fundamentals;
    if (typeof f.pe === "number" && Number.isFinite(f.pe)) {
      out.push({
        label: "P/E",
        value: f.pe.toFixed(1),
        source: "fundamentals",
        asOf: f.asOf,
      });
    }
    if (typeof f.pb === "number" && Number.isFinite(f.pb)) {
      out.push({ label: "P/B", value: f.pb.toFixed(1), source: "fundamentals" });
    }
    if (typeof f.fcfYield === "number" && Number.isFinite(f.fcfYield)) {
      out.push({
        label: "FCF-yield",
        value: `${(f.fcfYield * 100).toFixed(1)}%`,
        source: "fundamentals",
      });
    }
    if (typeof f.roic === "number" && Number.isFinite(f.roic)) {
      out.push({
        label: "ROIC",
        value: `${(f.roic * 100).toFixed(1)}%`,
        source: "fundamentals",
      });
    }
    if (typeof f.dividendYield === "number" && Number.isFinite(f.dividendYield)) {
      out.push({
        label: "Dividend-yield",
        value: `${(f.dividendYield * 100).toFixed(1)}%`,
        source: "fundamentals",
      });
    }
    if (typeof f.debtToEquity === "number" && Number.isFinite(f.debtToEquity)) {
      out.push({
        label: "Debt/Equity",
        value: f.debtToEquity.toFixed(2),
        source: "fundamentals",
      });
    }
  }

  if (input.valuation) {
    const v = input.valuation;
    out.push({
      label: "Koers",
      value: `${v.unitPrice.toFixed(2)} ${v.holding.currency}`,
      helper: v.asOf ? `per ${v.asOf}` : undefined,
      source: "fundamentals",
      asOf: v.asOf,
    });
  }

  if (input.mispricing) {
    out.push({
      label: "Mispricing-score",
      value: `${input.mispricing.aggregateScore}/100`,
      helper: `${(input.mispricing.aggregateConfidence * 100).toFixed(0)}% confidence`,
      source: "mispricing-scanner",
    });
  }

  if (input.opportunity) {
    out.push({
      label: "Opportunity-score",
      value: `${input.opportunity.score}/100`,
      helper: input.opportunity.confidence,
      source: "opportunity-radar",
    });
  }

  return out;
}

// ============================================================
//  Thesis-builder
// ============================================================

function buildThesis(context: ResearchContext): string {
  const parts: string[] = [];
  const composite = context.factorScore?.composite;
  if (typeof composite === "number" && Number.isFinite(composite)) {
    const grade = gradeFromComposite(Math.round(composite));
    parts.push(
      `${context.name ?? context.ticker} (${context.ticker}) heeft een composite ${Math.round(composite)}/100 (${grade}).`,
    );
  } else {
    parts.push(
      `${context.name ?? context.ticker} (${context.ticker}) heeft (nog) geen factor-score in deze sessie.`,
    );
  }

  const bullCount = context.bullPoints.length;
  const bearCount = context.bearPoints.length;
  if (bullCount > 0 || bearCount > 0) {
    parts.push(
      `Engines tonen ${bullCount} positief argument${bullCount === 1 ? "" : "en"} en ${bearCount} aandachtspunt${bearCount === 1 ? "" : "en"}.`,
    );
  }

  if (context.uncertainty.missingData.length > 0) {
    parts.push(
      `Onzekerheid: ${context.uncertainty.missingData.join(", ")}.`,
    );
  } else if (context.uncertainty.confidence < 0.5) {
    parts.push(
      "Onzekerheid: confidence ligt onder 50% — interpreteer behoedzaam.",
    );
  }

  return parts.join(" ");
}

function gradeFromComposite(score: number): string {
  if (score >= 75) return "sterk";
  if (score >= 60) return "bovengemiddeld";
  if (score >= 45) return "gemiddeld";
  if (score >= 30) return "ondergemiddeld";
  return "zwak";
}

// ============================================================
//  Decision-checklist (template + context-aware)
// ============================================================

function buildChecklist(context: ResearchContext): string[] {
  const items: string[] = [];

  // 1. Standaard reflectievragen.
  items.push(
    "Past dit instrument bij mijn beleggersprofiel (horizon, doel, risicobereidheid)?",
  );
  items.push(
    "Klopt de positiegrootte met mijn diversificatie- en cap-regels (max % per positie / sector)?",
  );

  // 2. Factor-driven vragen wanneer er een factorscore is.
  if (context.factorScore) {
    const sub = context.factorScore.subScores;
    if (sub.quality < 50) {
      items.push(
        "Quality-score is onder 50 — heb ik onderzocht of marges en ROIC structureel goed zijn?",
      );
    }
    if (sub.value > 65 && sub.momentum < 45) {
      items.push(
        "Hoge value, lage momentum — kan ik uitsluiten dat dit een value trap is (winstdaling, structurele tegenwind)?",
      );
    }
    if (sub.lowVol < 40) {
      items.push(
        "Risk/lowVol-score is laag — accepteer ik de hogere drawdown-kans?",
      );
    }
  } else {
    items.push(
      "Er is geen factor-score; heb ik zelf een minimum-kwaliteitscheck gedaan (rentedekking, marge-trend)?",
    );
  }

  // 3. Mispricing-driven vragen.
  if (context.mispricing) {
    items.push(
      "Mispricing-scanner: heb ik de keerzijde-nota (riskNote) gelezen voordat ik de signaalstrength accepteer?",
    );
  }

  // 4. Opportunity-radar vragen.
  if (context.opportunity) {
    items.push(
      "Opportunity-radar: zijn de signaal-rationales actueel (datum) en past de signaal-confidence bij mijn besluit?",
    );
  }

  // 5. Portefeuille-vragen.
  if (context.rebalance && context.rebalance.action !== "NO_ACTION") {
    items.push(
      "Rebalance-engine adviseert een aanpassing — past mijn besluit (bijkopen/afbouwen) bij de huidige weging?",
    );
  }

  // 6. Liquiditeit + kosten + belasting.
  items.push(
    "Heb ik gecheckt of broker-koers, spread, transactiekosten en eventuele dividendbelasting acceptabel zijn?",
  );
  items.push(
    "Wat is mijn vooraf gedefinieerde exit-trigger (stop-verlies of thesis-faal-criterium)?",
  );

  // 7. Onzekerheid.
  if (context.uncertainty.confidence < 0.6) {
    items.push(
      "Confidence in dit dossier is onder 60% — neem ik een kleinere positie of wacht ik op meer data?",
    );
  }

  return items;
}

// ============================================================
//  Confidence + uncertainty-utilities
// ============================================================

function computeConfidence(input: {
  factorScore: FactorScore | null;
  fundamentals: FundamentalsSnapshot | null;
  holding: Holding | null;
  mispricing: MispricingCandidate | null;
  opportunity: OpportunityCandidate | null;
}): number {
  let confidence = 0.3;
  if (input.factorScore) confidence += 0.2;
  if (input.factorScore && (input.factorScore.confidence ?? 0) >= 0.6) {
    confidence += 0.1;
  }
  if (input.fundamentals) confidence += 0.15;
  if (input.holding) confidence += 0.05;
  if (input.mispricing) confidence += 0.1;
  if (input.opportunity) confidence += 0.1;
  if (confidence > 1) return 1;
  if (confidence < 0) return 0;
  return Number(confidence.toFixed(2));
}

function confidenceNote(confidence: number, missingCount: number): string {
  if (confidence >= 0.75) {
    return "Hoge data-dekking; meerdere engines bevestigen het beeld.";
  }
  if (confidence >= 0.5) {
    return missingCount > 0
      ? `Matige data-dekking — ${missingCount} bron(nen) ontbreken.`
      : "Matige data-dekking — bevindingen zijn indicatief.";
  }
  return "Lage data-dekking; behandel dit dossier als richtinggevend, niet beslissend.";
}

// ============================================================
//  Helpers
// ============================================================

function dedupePoints(points: ResearchEvidencePoint[]): ResearchEvidencePoint[] {
  const seen = new Set<string>();
  const out: ResearchEvidencePoint[] = [];
  for (const p of points) {
    const key = `${p.source}::${p.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// ============================================================
//  Prompt-payload (voor toekomstige LLM-swap)
// ============================================================

/**
 * Bouwt een `system` + `user` prompt waarmee een toekomstige LLM-laag
 * **uitsluitend mag herformuleren** wat in de context staat. De LLM
 * krijgt geen vrijheid om scores aan te passen of getallen toe te
 * voegen; de strikte regels staan in de system-prompt en de user-
 * prompt levert de hele context als JSON.
 *
 * De huidige `renderResearchDossier` werkt 100% deterministisch zonder
 * deze prompt — de payload is voorbereid voor het moment dat we een
 * LLM willen toevoegen voor stilistische polishing.
 */
export interface ResearchDossierPromptPayload {
  system: string;
  user: string;
}

export const RESEARCH_DOSSIER_SYSTEM_PROMPT = [
  "Je bent BeleggerIQ Research-Assistent. Je enige taak is engine-output structureren in een Nederlandstalig research-dossier.",
  "",
  "Strikte regels:",
  "1. Gebruik UITSLUITEND cijfers, ratio's en feiten die in CONTEXT staan.",
  "2. Verzin geen nieuwe scores, koersdoelen, percentages, P/E-cijfers of bedragen.",
  "3. Pas geen factor-score, opportunity-score of mispricing-score aan; neem ze letterlijk over.",
  "4. Als er onzekerheid is (LOW confidence, missende fundamentals, kleine sample) benoem dat expliciet.",
  "5. Schrijf compact, zakelijk Nederlands. Geen marketing, geen superlatieven.",
  "6. Output bevat: thesis (≤ 3 zinnen), bull case (bullets), bear case (bullets), risico's (bullets), besluitchecklist (vragen), key numbers (tabel — letterlijk uit CONTEXT).",
  "7. Geen koop- of verkoopadvies. Geen 'wij raden aan'. Alleen feiten + reflectievragen.",
].join("\n");

export function buildResearchDossierPrompt(
  context: ResearchContext,
): ResearchDossierPromptPayload {
  const user = [
    `Use case: research-dossier voor ${context.ticker} (${context.name ?? "—"}).`,
    "",
    "CONTEXT (engine-output, niet aanpassen):",
    "```json",
    JSON.stringify(
      {
        ticker: context.ticker,
        name: context.name,
        generatedAt: context.generatedAt,
        keyMetrics: context.keyMetrics,
        bullPoints: context.bullPoints,
        bearPoints: context.bearPoints,
        riskPoints: context.riskPoints,
        uncertainty: context.uncertainty,
        sourceEngines: context.sourceEngines,
      },
      null,
      2,
    ),
    "```",
    "",
    "Geef de output in dezelfde structuur als `ResearchDossier`.",
    "Citeer cijfers letterlijk uit CONTEXT.keyMetrics; voeg er zelf geen toe.",
  ].join("\n");

  return { system: RESEARCH_DOSSIER_SYSTEM_PROMPT, user };
}

// ============================================================
//  Validation helpers
// ============================================================

/**
 * Sanity-check op een (theoretisch) AI-gegenereerde dossier-output:
 * elk getal/percentage in `text` moet ook in `context.keyMetrics`
 * voorkomen, anders kan er een verzonnen waarde tussen zitten.
 *
 * Wordt nu nog niet door de runtime gebruikt (de renderer is puur),
 * maar staat klaar voor de LLM-swap.
 */
export function validateAiOutputAgainstContext(
  text: string,
  context: ResearchContext,
): { ok: boolean; rejectedClaims: string[] } {
  const rejected: string[] = [];
  const allowed = new Set<string>();
  for (const m of context.keyMetrics) {
    allowed.add(m.value.replace(/\s+/g, ""));
  }
  for (const p of [
    ...context.bullPoints,
    ...context.bearPoints,
    ...context.riskPoints,
  ]) {
    const matches = p.text.match(/-?\d+(?:[.,]\d+)?%?/g);
    if (matches) {
      for (const x of matches) allowed.add(x.replace(/\s+/g, ""));
    }
  }

  const candidates = text.match(/-?\d+(?:[.,]\d+)?%?/g) ?? [];
  for (const candidate of candidates) {
    const norm = candidate.replace(/\s+/g, "");
    // Toelaten als één van de allowed-strings de candidate bevat (substring-tolerantie).
    let found = false;
    for (const a of allowed) {
      if (a.includes(norm) || norm.includes(a)) {
        found = true;
        break;
      }
    }
    if (!found) rejected.push(candidate);
  }

  return { ok: rejected.length === 0, rejectedClaims: rejected };
}

// ============================================================
//  Helpers (vervolg)
// ============================================================

function explainMispricingFlag(code: string): string {
  switch (code) {
    case "value-trap":
      return "Value-trap-risico — lage ratio's kunnen structurele winstdaling reflecteren.";
    case "earnings-deterioration-unknown":
      return "Recente winstontwikkeling is niet gecontroleerd; mogelijk onderliggende verslechtering.";
    case "thin-peer-basket":
      return "Peer-basket is klein; peer-vergelijking is minder robuust.";
    case "small-sample-volatility":
      return "Volatiliteitsmeting op kleine sample; interpretatie is onzeker.";
    case "short-history":
      return "Minder dan een volledig jaar aan koersdata; lange-termijn claims zwak onderbouwd.";
    case "single-source-fundamentals":
      return "Fundamentals komen uit één provider; geen cross-check tegen second source.";
    case "sentiment-proxy-only":
      return "Geen echte sentiment-feed; signaal gebruikt volatility-proxy.";
    case "quality-degradation-unknown":
      return "Geen historische factor-snapshots; mogelijk is de quality-score recent gekelderd.";
    case "momentum-reversal-fragile":
      return "Keerpunt kan kortstondig zijn; vroege signalen zijn vaak fragiel.";
    default:
      return `Risk-flag: ${code}`;
  }
}
