import type { PolicyReport, PolicyViolation, ViolationSeverity } from "@/lib/analytics/policy-engine";
import type { Currency } from "@/types/common";
import type { RebalanceRecommendation, RebalanceQuantityPlan } from "@/types/rebalance";
import type {
  PortfolioRiskSummary,
  PositionRiskAnalysis,
  RiskFlag,
  RiskSeverity,
} from "@/types/risk";

import type { PortfolioQualityReport, HoldingQuality } from "../data-quality";

/**
 * Risk-action mapper — pure aggregator boven de risk-engine, rebalance
 * quantity-engine, policy-engine en data-quality-engine.
 *
 * Doel: maak risico's actiegericht. Elke kaart antwoordt op:
 *   - wat is het probleem?
 *   - waarom is het belangrijk? (impact)
 *   - wat moet ik doen? (recommendedAction)
 *   - hoeveel aandelen / euro's? (sharesToSell / amountToSell)
 *
 * Reproduceerbaar: identieke input → identieke output. Geen AI. Geen
 * externe state. Aantallen komen letterlijk uit
 * `RebalanceRecommendation.quantityPlan` (rebalance-quantity-engine).
 *
 * Strategie:
 *   1. **POSITION_CONCENTRATION** — combineer position-flags
 *      ("concentration.position") met de matching rebalance-quantity-plan
 *      voor letterlijke shares + postActionWeight.
 *   2. **POLICY_VIOLATION** — major/critical policy-overschrijdingen die
 *      niet al via een concentration-flag worden afgedekt; matcht óók
 *      met de rebalance-quantity-plan voor shares.
 *   3. **SECTOR_BIAS** — top-sector boven threshold (uit risk-engine
 *      flags). Geen shares; recommendedAction is structureel.
 *   4. **CURRENCY_RISK** — foreign currency exposure boven threshold.
 *   5. **TOP5_CONCENTRATION** — top-5 weegt te zwaar.
 *   6. **VOLATILITY / DRAWDOWN** — portfolio volatility of drawdown
 *      buiten profiel; geen shares (action is "verlaag exposure
 *      structureel"). Confidence reflecteert datacoverage.
 *   7. **LOW_DATA_QUALITY** — major-severity holdings met materieel
 *      gewicht (≥ 5%); shows "onvoldoende data", recommendedAction is
 *      "Vul ontbrekende velden in".
 *
 * Sortering:
 *   - severity-rank desc (critical=4, high=3, elevated=2, moderate=1, low=0)
 *   - daarna confidence desc
 *   - daarna type-rank (POSITION_CONCENTRATION & POLICY_VIOLATION > SECTOR
 *     > CURRENCY > TOP5 > VOLATILITY > LOW_DATA_QUALITY)
 *   - daarna `id` alfabetisch (stabiele tie-break)
 *
 * Output: maximaal 3 (configureerbaar via `maxActions`).
 */

// ============================================================
//  Types
// ============================================================

export type DashboardRiskType =
  | "POSITION_CONCENTRATION"
  | "POLICY_VIOLATION"
  | "SECTOR_BIAS"
  | "CURRENCY_RISK"
  | "TOP5_CONCENTRATION"
  | "VOLATILITY"
  | "DRAWDOWN"
  | "LOW_DATA_QUALITY";

export type DashboardRiskSeverity = RiskSeverity;

export type DashboardRiskSource =
  | "risk-engine"
  | "rebalance-engine"
  | "policy-engine"
  | "data-quality";

export interface DashboardRiskAction {
  /** Stabiel id — `${riskType}:${symbol ?? "global"}`. */
  id: string;
  riskType: DashboardRiskType;
  /** NL-zin: "Rheinmetall weegt 17,5% van de portefeuille". */
  title: string;
  /** 1-zin uitleg waarom dit een risico is (impact). */
  impact: string;
  /** Imperatieve actie: "Verkoop indicatief 1 aandeel". */
  recommendedAction: string;
  /** Letterlijk uit rebalance-quantity-engine. Undefined wanneer N.v.t. */
  sharesToSell?: number;
  /** Letterlijk uit rebalance-quantity-engine, base currency. */
  amountToSell?: number;
  /** Geprojecteerd gewicht (0..100%) NA verkoop, uit quantity-engine. */
  postActionWeight?: number;
  symbol?: string;
  severity: DashboardRiskSeverity;
  /** 0..1 — daalt bij ontbrekende data of lage classifier-confidence. */
  confidence: number;
  /** Volledige context-zin met getallen + thresholds. */
  explanation: string;
  /** True wanneer aantallen niet betrouwbaar te bepalen zijn. */
  insufficientData: boolean;
  sourceEngine: DashboardRiskSource;
}

export interface BuildRiskActionsInput {
  risk: PortfolioRiskSummary;
  rebalanceRecommendations: RebalanceRecommendation[];
  policyReport: PolicyReport | null;
  qualityReport: PortfolioQualityReport | null;
  baseCurrency: Currency;
  /** Default 3. */
  maxActions?: number;
}

// ============================================================
//  Drempels (expliciet)
// ============================================================

const SEVERITY_RANK: Record<RiskSeverity, number> = {
  critical: 4,
  high: 3,
  elevated: 2,
  moderate: 1,
  low: 0,
};

const VIOLATION_SEVERITY_TO_RISK: Record<ViolationSeverity, RiskSeverity> = {
  ok: "low",
  minor: "moderate",
  major: "high",
  critical: "critical",
};

const TYPE_RANK: Record<DashboardRiskType, number> = {
  POSITION_CONCENTRATION: 8,
  POLICY_VIOLATION: 7,
  SECTOR_BIAS: 6,
  CURRENCY_RISK: 5,
  TOP5_CONCENTRATION: 4,
  VOLATILITY: 3,
  DRAWDOWN: 2,
  LOW_DATA_QUALITY: 1,
};

const QUALITY_MATERIAL_WEIGHT = 0.05; // ≥ 5% portfolio-weight = materieel

// ============================================================
//  Builder
// ============================================================

export function buildRiskActions(
  input: BuildRiskActionsInput,
): DashboardRiskAction[] {
  const max = input.maxActions ?? 3;
  const candidates: DashboardRiskAction[] = [];

  candidates.push(...buildPositionConcentrationActions(input));
  candidates.push(...buildPolicyViolationActions(input, candidates));
  const sectorAction = buildSectorBiasAction(input);
  if (sectorAction) candidates.push(sectorAction);
  const currencyAction = buildCurrencyAction(input);
  if (currencyAction) candidates.push(currencyAction);
  const top5Action = buildTop5Action(input);
  if (top5Action) candidates.push(top5Action);
  const volAction = buildVolatilityAction(input);
  if (volAction) candidates.push(volAction);
  const ddAction = buildDrawdownAction(input);
  if (ddAction) candidates.push(ddAction);
  candidates.push(...buildDataQualityActions(input));

  // Dedup op id (mag voorkomen wanneer position-flag + policy-violation
  // beide naar dezelfde ticker wijzen). Eerste wint: position-flag heeft
  // hogere type-rank, dus dat is de juiste keuze.
  const dedupById = new Map<string, DashboardRiskAction>();
  for (const c of candidates) {
    if (!dedupById.has(c.id)) dedupById.set(c.id, c);
  }

  return [...dedupById.values()].sort(compareRiskActions).slice(0, max);
}

// ============================================================
//  Sub-builders (pure)
// ============================================================

interface RebalanceLookup {
  byTicker: Map<string, RebalanceRecommendation>;
}

function buildLookup(
  recs: RebalanceRecommendation[],
): RebalanceLookup {
  const byTicker = new Map<string, RebalanceRecommendation>();
  for (const r of recs) byTicker.set(r.ticker, r);
  return { byTicker };
}

function buildPositionConcentrationActions(
  input: BuildRiskActionsInput,
): DashboardRiskAction[] {
  const out: DashboardRiskAction[] = [];
  const lookup = buildLookup(input.rebalanceRecommendations);
  const positionFlags = input.risk.flags.filter(
    (f) => f.code === "concentration.position",
  );
  if (positionFlags.length === 0) return out;

  // Risk-engine genereert maximaal één "concentration.position"-flag per
  // run (voor grootste positie). We koppelen 'm aan de eerste positie
  // wiens weight ≥ threshold matcht — robuuster dan name-parsing.
  const flag = positionFlags[0]!;
  const threshold = flag.threshold ?? 0.10;
  const offender = pickConcentrationOffender(input.risk.positions, threshold);
  if (!offender) return out;

  const rec = lookup.byTicker.get(offender.ticker);
  out.push(
    composeConcentrationAction({
      offender,
      threshold,
      flag,
      rec: rec ?? null,
    }),
  );
  return out;
}

function pickConcentrationOffender(
  positions: PositionRiskAnalysis[],
  threshold: number,
): PositionRiskAnalysis | null {
  let best: PositionRiskAnalysis | null = null;
  for (const p of positions) {
    if (p.concentrationWeight < threshold) continue;
    if (!best || p.concentrationWeight > best.concentrationWeight) best = p;
  }
  return best;
}

interface ConcentrationContext {
  offender: PositionRiskAnalysis;
  threshold: number;
  flag: RiskFlag;
  rec: RebalanceRecommendation | null;
}

function composeConcentrationAction(
  ctx: ConcentrationContext,
): DashboardRiskAction {
  const symbol = ctx.offender.ticker;
  const weightPct = ctx.offender.concentrationWeight * 100;
  const thresholdPct = ctx.threshold * 100;
  const name = ctx.rec?.name ?? symbol;

  const plan = ctx.rec?.quantityPlan ?? null;
  const insufficient = plan === null || plan.currentPrice === null;

  const severity: RiskSeverity = ctx.flag.severity;
  const title = `${name} weegt ${formatPct1(weightPct)} van de portefeuille`;
  const impact = `Eén positie boven de drempel van ${formatPct0(thresholdPct)} betekent dat een drawdown in dit bedrijf direct circa ${formatPct1(weightPct)} van je portefeuille raakt.`;

  const recommendedAction = buildConcentrationRecommendation({
    plan,
    name,
  });
  const explanation = buildConcentrationExplanation({
    name,
    weightPct,
    thresholdPct,
    plan,
  });

  return {
    id: `POSITION_CONCENTRATION:${symbol}`,
    riskType: "POSITION_CONCENTRATION",
    title,
    impact,
    recommendedAction,
    sharesToSell: plan?.sharesToSell,
    amountToSell: plan?.amountToSell,
    postActionWeight: plan?.postSellWeight,
    symbol,
    severity,
    confidence: deriveConfidence(plan),
    explanation,
    insufficientData: insufficient,
    sourceEngine: plan ? "rebalance-engine" : "risk-engine",
  };
}

function buildConcentrationRecommendation(args: {
  plan: RebalanceQuantityPlan | null;
  name: string;
}): string {
  const { plan, name } = args;
  if (plan === null || plan.currentPrice === null) {
    return `Bouw ${name} indicatief af tot binnen de policy-cap; aantal stuks niet te bepalen zonder koersdata.`;
  }
  if (plan.sharesToSell === 0) {
    return `Geen verkoop nodig: bestaande overschrijding is kleiner dan één aandeel bij de huidige koers.`;
  }
  const unit = plan.sharesToSell === 1 ? "aandeel" : "aandelen";
  return `Verkoop indicatief ${plan.sharesToSell} ${unit} ${name}. Nieuwe weging: circa ${formatPct1(plan.postSellWeight)}.`;
}

function buildConcentrationExplanation(args: {
  name: string;
  weightPct: number;
  thresholdPct: number;
  plan: RebalanceQuantityPlan | null;
}): string {
  const { name, weightPct, thresholdPct, plan } = args;
  const head = `${name} staat op ${formatPct1(weightPct)} (drempel ${formatPct0(thresholdPct)}).`;
  if (plan === null || plan.currentPrice === null) {
    return `${head} Quantity-engine kon geen aantal stuks berekenen — koersdata ontbreekt.`;
  }
  if (plan.sharesToSell === 0) {
    return `${head} Quantity-engine ziet geen overschrijding groot genoeg voor één aandeel verkoop.`;
  }
  const unit = plan.sharesToSell === 1 ? "aandeel" : "aandelen";
  return `${head} Quantity-engine adviseert ${plan.sharesToSell} ${unit} verkopen voor circa €${formatNumber(plan.amountToSell, 0)} (post-sell weight ${formatPct1(plan.postSellWeight)}).`;
}

function buildPolicyViolationActions(
  input: BuildRiskActionsInput,
  existing: DashboardRiskAction[],
): DashboardRiskAction[] {
  const out: DashboardRiskAction[] = [];
  const report = input.policyReport;
  if (!report) return out;

  const lookup = buildLookup(input.rebalanceRecommendations);
  const taken = new Set(
    existing
      .filter((a) => a.symbol !== undefined)
      .map((a) => a.symbol as string),
  );

  // Alleen major en critical worden als acties getoond; minor blijft
  // onder de radar (te veel ruis).
  const heavy = report.violations
    .filter(
      (v) =>
        v.violationSeverity === "major" || v.violationSeverity === "critical",
    )
    .filter((v) => !taken.has(v.ticker));

  // Sorteer op excess weight (zwaarste eerst) zodat top-overschrijders
  // sowieso boven minder-zware uitkomen wanneer er meerdere zijn.
  heavy.sort((a, b) => b.excessWeight - a.excessWeight);

  for (const v of heavy) {
    const rec = lookup.byTicker.get(v.ticker);
    out.push(composePolicyViolationAction({ violation: v, rec: rec ?? null }));
  }
  return out;
}

interface PolicyViolationContext {
  violation: PolicyViolation;
  rec: RebalanceRecommendation | null;
}

function composePolicyViolationAction(
  ctx: PolicyViolationContext,
): DashboardRiskAction {
  const v = ctx.violation;
  const symbol = v.ticker;
  const weightPct = v.currentWeight * 100;
  const capPct = Number.isFinite(v.allowedMaxWeight)
    ? v.allowedMaxWeight * 100
    : null;
  const name = ctx.rec?.name ?? symbol;
  const plan = ctx.rec?.quantityPlan ?? null;
  const insufficient = plan === null || plan.currentPrice === null;

  // Type-aware micro-copy: ETFs vs single stocks krijgen een andere
  // verklaring zodat de policy-engine-classificatie zichtbaar blijft.
  const isEtfFamily =
    v.instrumentType.endsWith("_ETF") ||
    v.instrumentType === "INCOME_ETF" ||
    v.instrumentType === "BOND_ETF" ||
    v.instrumentType === "COMMODITY_ETF" ||
    v.instrumentType === "FACTOR_ETF" ||
    v.instrumentType === "BROAD_MARKET_ETF" ||
    v.instrumentType === "SECTOR_ETF" ||
    v.instrumentType === "THEME_ETF";

  const head = capPct !== null
    ? `${name} weegt ${formatPct1(weightPct)} — boven de policy-cap van ${formatPct0(capPct)}.`
    : `${name} weegt ${formatPct1(weightPct)} en overschrijdt de policy.`;

  const impactPrefix = isEtfFamily
    ? "Voor dit ETF-type past de cap bij gewenste spreiding"
    : "Voor een single-stock past de cap bij diversificatie-principes";
  const impact = `${impactPrefix}; bij overschrijding hangt de portefeuille te zwaar aan deze regel.`;

  const recommendedAction = buildConcentrationRecommendation({ plan, name });

  const explanation =
    capPct !== null
      ? `${head} ${v.policyReason} ${
          plan && plan.currentPrice !== null && plan.sharesToSell > 0
            ? `Quantity-engine: ${plan.sharesToSell} ${plan.sharesToSell === 1 ? "stuk" : "stuks"} verkopen voor €${formatNumber(plan.amountToSell, 0)}.`
            : "Aantal stuks volgt zodra koersdata beschikbaar is."
        }`
      : head;

  return {
    id: `POLICY_VIOLATION:${symbol}`,
    riskType: "POLICY_VIOLATION",
    title: head,
    impact,
    recommendedAction,
    sharesToSell: plan?.sharesToSell,
    amountToSell: plan?.amountToSell,
    postActionWeight: plan?.postSellWeight,
    symbol,
    severity: VIOLATION_SEVERITY_TO_RISK[v.violationSeverity],
    confidence: deriveConfidence(plan),
    explanation,
    insufficientData: insufficient,
    sourceEngine: plan ? "rebalance-engine" : "policy-engine",
  };
}

function buildSectorBiasAction(
  input: BuildRiskActionsInput,
): DashboardRiskAction | null {
  const flag = input.risk.flags.find((f) => f.code === "concentration.sector");
  if (!flag) return null;
  const sector = input.risk.topSector;
  if (!sector) return null;
  const weightPct = sector.weight * 100;
  const thresholdPct = (flag.threshold ?? 0.4) * 100;
  return {
    id: `SECTOR_BIAS:global`,
    riskType: "SECTOR_BIAS",
    title: `Sector ${sector.label} weegt ${formatPct1(weightPct)}`,
    impact: `Eén sector domineert; sector-specifieke schokken (regulering, rentes, cyclus) raken de portefeuille extra hard.`,
    recommendedAction: `Verminder ${sector.label}-exposure structureel — vervang een deel door een breder gespreide ETF of een andere sector. Geen specifiek aantal stuks: betreft meerdere posities.`,
    severity: flag.severity,
    confidence: 0.85,
    explanation: `Sector ${sector.label} staat op ${formatPct1(weightPct)} (drempel ${formatPct0(thresholdPct)}). Risk-engine raadt aan deze concentratie af te bouwen.`,
    insufficientData: false,
    sourceEngine: "risk-engine",
  };
}

function buildCurrencyAction(
  input: BuildRiskActionsInput,
): DashboardRiskAction | null {
  const flag = input.risk.flags.find((f) => f.code === "exposure.currency");
  if (!flag) return null;
  const exposure = input.risk.foreignCurrencyExposure ?? flag.metric ?? 0;
  const exposurePct = exposure * 100;
  const thresholdPct = (flag.threshold ?? 0.6) * 100;
  return {
    id: `CURRENCY_RISK:global`,
    riskType: "CURRENCY_RISK",
    title: `${formatPct0(exposurePct)} van de portefeuille staat in vreemde valuta`,
    impact: `Een sterkere ${input.baseCurrency} vertaalt zich direct in lagere ${input.baseCurrency}-waardes — dit risico telt náást bedrijfsspecifiek risico.`,
    recommendedAction: `Voeg een ${input.baseCurrency}-hedged variant of een ${input.baseCurrency}-genoteerd alternatief toe. Geen specifiek aantal stuks: betreft meerdere posities.`,
    severity: flag.severity,
    confidence: 0.8,
    explanation: `Foreign-currency exposure staat op ${formatPct1(exposurePct)} (drempel ${formatPct0(thresholdPct)}).`,
    insufficientData: false,
    sourceEngine: "risk-engine",
  };
}

function buildTop5Action(
  input: BuildRiskActionsInput,
): DashboardRiskAction | null {
  const flag = input.risk.flags.find((f) => f.code === "concentration.top5");
  if (!flag) return null;
  const weight = input.risk.top5Weight ?? flag.metric ?? 0;
  const weightPct = weight * 100;
  const thresholdPct = (flag.threshold ?? 0.7) * 100;
  return {
    id: `TOP5_CONCENTRATION:global`,
    riskType: "TOP5_CONCENTRATION",
    title: `Top-5 posities vormen ${formatPct0(weightPct)} van de portefeuille`,
    impact: `Een te kleine bovenlaag betekent dat een schok in slechts 5 namen een groot deel van de portefeuille kan raken.`,
    recommendedAction: `Bouw één van de zwaarste 2 posities licht af of breid uit met 1–2 nieuwe posities buiten de top-5.`,
    severity: flag.severity,
    confidence: 0.85,
    explanation: `Top-5 weegt ${formatPct1(weightPct)} (drempel ${formatPct0(thresholdPct)}).`,
    insufficientData: false,
    sourceEngine: "risk-engine",
  };
}

function buildVolatilityAction(
  input: BuildRiskActionsInput,
): DashboardRiskAction | null {
  const vol = input.risk.portfolioVolatility;
  if (vol === undefined || vol === null) return null;
  if (vol < 0.20) return null; // < 20% jaarvolatility is geen issue
  const severity: RiskSeverity = vol >= 0.30 ? "high" : "elevated";
  return {
    id: `VOLATILITY:global`,
    riskType: "VOLATILITY",
    title: `Portfolio-volatility ${formatPct1(vol * 100)} (jaarbasis)`,
    impact: `Hogere volatility betekent grotere schommelingen in waarde — kan boven je risk-tolerance liggen, vooral richting pensioen of als je binnen 3 jaar geld nodig hebt.`,
    recommendedAction: `Verhoog defensieve allocatie (bond-ETF, cash, low-vol factor) of bouw 1 high-vol positie af. Geen specifiek aantal stuks: structurele keuze.`,
    severity,
    confidence: 0.7,
    explanation: `Risk-engine meet portfolio-volatility ${formatPct1(vol * 100)}; boven 20% beschouwen we het als verhoogd, boven 30% als hoog.`,
    insufficientData: false,
    sourceEngine: "risk-engine",
  };
}

function buildDrawdownAction(
  input: BuildRiskActionsInput,
): DashboardRiskAction | null {
  const dd = input.risk.maxDrawdown;
  if (dd === undefined || dd === null) return null;
  const ddAbs = Math.abs(dd);
  if (ddAbs < 0.20) return null;
  const severity: RiskSeverity = ddAbs >= 0.35 ? "high" : "elevated";
  return {
    id: `DRAWDOWN:global`,
    riskType: "DRAWDOWN",
    title: `Historische max-drawdown ${formatPct1(ddAbs * 100)}`,
    impact: `Een diepe drawdown duidt op fragiliteit in stress-scenario's; herstel duurt vaak meerdere jaren en kan financiële plannen uitstellen.`,
    recommendedAction: `Test je portefeuille in /backtest met regime-aware strategy of pas de allocatie aan met defensiever profiel. Geen specifiek aantal stuks: structurele keuze.`,
    severity,
    confidence: 0.7,
    explanation: `Risk-engine ziet ${formatPct1(ddAbs * 100)} als historische dieptepunt; boven 20% noemen we het verhoogd, boven 35% hoog.`,
    insufficientData: false,
    sourceEngine: "risk-engine",
  };
}

function buildDataQualityActions(
  input: BuildRiskActionsInput,
): DashboardRiskAction[] {
  const report = input.qualityReport;
  if (!report) return [];

  // We tonen alleen materiële holdings (≥ 5% portfolio-weight) met major
  // severity — minor severity is een nice-to-have, niet een hot-risk.
  const offenders: HoldingQuality[] = report.holdings.filter(
    (h) => h.severity === "major" && h.weight >= QUALITY_MATERIAL_WEIGHT,
  );
  if (offenders.length === 0) return [];

  // Pak de zwaarst-wegende offender (dat is de impactvolste).
  offenders.sort((a, b) => b.weight - a.weight);
  const top = offenders[0]!;

  const weightPct = top.weight * 100;
  const missingLabels = top.missing.slice(0, 4).join(", ");

  return [
    {
      id: `LOW_DATA_QUALITY:${top.ticker}`,
      riskType: "LOW_DATA_QUALITY",
      title: `${top.ticker} mist kritieke velden (${formatPct1(weightPct)} van portefeuille)`,
      impact: `Zonder volledige metadata kunnen risk- en allocation-engines dit instrument niet betrouwbaar evalueren — beslissingen erover dragen onzekerheid.`,
      recommendedAction: `Vul ontbrekende velden aan via portefeuille-import of een handmatige override; pas dán beslissingen verifiëren in de cockpit.`,
      symbol: top.ticker,
      severity: "moderate",
      confidence: clamp01(top.confidence),
      explanation: `Data-quality-engine markeert ${top.ticker} als "major" (completeness ${(top.completeness * 100).toFixed(0)}%); ontbrekend: ${missingLabels || "—"}.`,
      insufficientData: true,
      sourceEngine: "data-quality",
    },
  ];
}

// ============================================================
//  Helpers (pure)
// ============================================================

function deriveConfidence(plan: RebalanceQuantityPlan | null): number {
  if (!plan) return 0.4;
  switch (plan.confidence) {
    case "HIGH":
      return 0.9;
    case "MEDIUM":
      return 0.7;
    case "LOW":
      return 0.45;
  }
}

function compareRiskActions(
  a: DashboardRiskAction,
  b: DashboardRiskAction,
): number {
  const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sevDiff !== 0) return sevDiff;
  const confDiff = b.confidence - a.confidence;
  if (Math.abs(confDiff) > 1e-9) return confDiff;
  const typeDiff = TYPE_RANK[b.riskType] - TYPE_RANK[a.riskType];
  if (typeDiff !== 0) return typeDiff;
  return a.id.localeCompare(b.id);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
}

function formatPct1(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function formatPct0(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("nl-NL", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}
