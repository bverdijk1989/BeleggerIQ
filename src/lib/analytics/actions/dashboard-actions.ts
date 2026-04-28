import type { ActionPlan, ActionSource, PositionAction } from "./types";
import { computeRedeploy, type RegimeStanceTier } from "./redeploy-budget";
import type { AllocationPlan } from "@/types/allocation";
import type { AssetClass } from "@/types/portfolio";
import type { PolicySettings, RiskTolerance } from "@/types/profile";
import type { MarketRegimeScore } from "@/types/regime";
import type { PortfolioRiskSummary } from "@/types/risk";
import type { RebalanceRecommendation } from "@/types/rebalance";

/**
 * Dashboard Primary Actions — pure aggregator boven op de bestaande
 * engines.
 *
 * Doel: lever maximaal 3 zeer concrete acties die de gebruiker NU kan
 * uitvoeren. Voorbeelden:
 *   - "Verkoop 1 aandeel Rheinmetall"
 *   - "Bouw Vanguard S&P 500 met 4 units af"
 *   - "Koop deze maand €300 ASML"
 *   - "Doe niets: marktregime defensief en risico al hoog"
 *
 * Reproduceerbaar (geen AI). Geen externe state. Identieke input →
 * identieke output (test gepind).
 *
 * Strategie:
 *   1. **RISK_REDUCTION** — eerst SELL/TRIM-paden uit de actie-engine,
 *      verrijkt met `RebalanceRecommendation.quantityPlan` voor
 *      letterlijke aantallen.
 *   2. **BUY_OPPORTUNITY** — top BUY-paden uit de actie-engine, of
 *      anders de eerste positieve recommendation uit de monthly buy-plan.
 *   3. **HOLD_CASH** — wanneer regime defensief én cash-share groot.
 *   4. **DO_NOTHING** — fallback wanneer er geen sterke trigger is.
 *
 * De top-3 wordt gesorteerd op urgency desc → confidence desc →
 * source-prioriteit. Bij gelijke urgency krijgen RISK-acties voorrang
 * boven BUY-acties (kapitaalbehoud > kapitaalinzet).
 */

// ============================================================
//  Types
// ============================================================

export type DashboardActionType =
  | "RISK_REDUCTION"
  | "BUY_OPPORTUNITY"
  | "HOLD_CASH"
  | "DO_NOTHING";

export type DashboardActionUrgency = "LOW" | "MEDIUM" | "HIGH";

export type DashboardActionSource =
  | "action-engine"
  | "rebalance-engine"
  | "allocation-engine"
  | "market-regime"
  | "risk-engine";

export interface DashboardAction {
  /** Stabiel id — `${type}:${symbol ?? "global"}` voor dedup. */
  id: string;
  type: DashboardActionType;
  /** NL-zin in imperatief: "Verkoop 1 aandeel X" / "Koop deze maand €300 X". */
  title: string;
  /** 1-zin uitleg waarom de actie logisch is. */
  description: string;
  urgency: DashboardActionUrgency;
  amount?: number;
  shares?: number;
  symbol?: string;
  /** 0..1 — overgenomen uit onderliggende engine-output. */
  confidence: number;
  /** Korte reason-string uit de bron (bv. action-engine rationale). */
  reason: string;
  sourceEngine: DashboardActionSource;
  /**
   * Welke engines droegen bij aan dit signaal — voor traceability in de
   * UI ("factor-engine · risk-engine") en voor diagnostiek wanneer twee
   * engines tegen elkaar in werken.
   */
  triggerSources?: ActionSource[];
  /**
   * Bij `RISK_REDUCTION`: gekoppelde herinvesteringssuggestie zodat de
   * proceeds van een SELL niet als idle cash blijven liggen. Pure data;
   * UI bepaalt of 'em als secundaire sectie binnen dezelfde kaart wordt
   * getoond. Regime-aware: 80% in RISK_ON/NEUTRAL, 60% in DEFENSIVE.
   */
  pairedBuy?: PairedBuySuggestion | null;
}

export interface PairedBuySuggestion {
  /** Symbool van de kandidaat-target (uit het allocation-plan). */
  symbol: string;
  name: string | null;
  /** Bedrag in base-currency dat we voorstellen om te herinvesteren. */
  amount: number;
  /** Fractie van proceeds (bv. 0.8 of 0.6). */
  redeployFraction: number;
  /** Cash dat bewust achterblijft als buffer (proceeds - amount). */
  reservedCash: number;
  /** Korte uitleg waarom dit bedrag + deze ticker. */
  rationale: string;
}

export interface BuildDashboardActionsInput {
  actionPlan: ActionPlan;
  rebalanceRecommendations: RebalanceRecommendation[];
  allocationPlan: AllocationPlan | null;
  regime: MarketRegimeScore | null;
  risk: PortfolioRiskSummary;
  /** Cash als fractie van portefeuille (0..1). */
  cashShare: number;
  /** Asset-class per ticker (voor unit-noun "aandelen"/"units"/"stuks"). */
  assetClassByTicker?: Map<string, AssetClass>;
  /** Policy van de user — `maxCashShare` overruled de default-drempel. */
  policy?: PolicySettings | null;
  /** Risk-tolerance — bij CONSERVATIVE krijgen RISK-acties extra voorrang. */
  riskTolerance?: RiskTolerance | null;
  /** Maximaal aantal acties (default 3). */
  maxActions?: number;
}

const URGENCY_RANK: Record<DashboardActionUrgency, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};
const TYPE_RANK_DEFAULT: Record<DashboardActionType, number> = {
  RISK_REDUCTION: 4,
  BUY_OPPORTUNITY: 3,
  HOLD_CASH: 2,
  DO_NOTHING: 1,
};
/**
 * Voor CONSERVATIVE / risk-averse profielen krijgt RISK_REDUCTION een
 * urgency-bonus zodat 'ie ook bij gelijke ruwe-urgency vóór BUY's komt.
 * We hangen dit op de **type-rank** (bij urgency-tie wint RISK harder)
 * én op de urgency: een MEDIUM RISK-actie wordt als HIGH behandeld.
 */
function shouldElevateRisk(
  riskTolerance: RiskTolerance | null | undefined,
): boolean {
  return riskTolerance === "CONSERVATIVE";
}

const TYPE_RANK_RISK_AVERSE: Record<DashboardActionType, number> = {
  RISK_REDUCTION: 6, // grotere gap met BUY
  BUY_OPPORTUNITY: 3,
  HOLD_CASH: 2,
  DO_NOTHING: 1,
};

// Default: cash > 25% in defensief regime / hoog risico triggert HOLD_CASH.
const DEFAULT_HOLD_CASH_MIN_SHARE = 0.25;

// ============================================================
//  Public
// ============================================================

export function buildDashboardPrimaryActions(
  input: BuildDashboardActionsInput,
): DashboardAction[] {
  const max = input.maxActions ?? 3;
  const riskAverse = shouldElevateRisk(input.riskTolerance);
  const cashThreshold =
    typeof input.policy?.maxCashShare === "number" &&
    input.policy.maxCashShare > 0 &&
    input.policy.maxCashShare <= 1
      ? input.policy.maxCashShare
      : DEFAULT_HOLD_CASH_MIN_SHARE;

  const candidates: DashboardAction[] = [];

  // --- 1. RISK_REDUCTION ---
  const stanceTier = mapStanceTier(input.regime);
  for (const action of input.actionPlan.positions) {
    if (action.action !== "TRIM" && action.action !== "SELL") continue;
    const card = toRiskAction(
      action,
      input.rebalanceRecommendations,
      input.assetClassByTicker,
      riskAverse,
    );
    if (!card) continue; // gefiltered: SELL zonder zinvol aantal

    // **Paired BUY (Fix B).** Voor elke RISK_REDUCTION kaart koppelen
    // we een redeploy-suggestie. Regime-aware: 80% in RISK_ON/NEUTRAL,
    // 60% in DEFENSIVE — extra cash blijft als droog kruit voor
    // latere koopjes (Druckenmiller/Marks-laag).
    const proceeds = card.amount ?? 0;
    if (proceeds > 0) {
      const redeploy = computeRedeploy({
        proceeds,
        stance: stanceTier,
        allocationPlan: input.allocationPlan,
        excludeSymbol: card.symbol ?? null,
      });
      if (redeploy.target) {
        card.pairedBuy = {
          symbol: redeploy.target.ticker,
          name: redeploy.target.name,
          amount: redeploy.target.amount,
          redeployFraction: redeploy.redeployFraction,
          reservedCash: redeploy.reservedCash,
          rationale: redeploy.reasoning,
        };
      } else {
        // Geen kandidaat → geen pairedBuy. UI laat 'em weg, of toont
        // een neutrale "geen geschikte ticker"-melding.
        card.pairedBuy = null;
      }
    }
    candidates.push(card);
  }

  // --- 2. BUY_OPPORTUNITY uit action-engine ---
  for (const action of input.actionPlan.positions) {
    if (action.action !== "BUY") continue;
    candidates.push(toBuyAction(action, input.assetClassByTicker));
  }

  // --- 2b. BUY_OPPORTUNITY uit monthly allocation-plan ---
  // Aanvullen als de action-engine geen BUY-kandidaten heeft of als
  // de allocation-plan andere tickers voorstelt.
  if (input.allocationPlan) {
    const haveBuy = candidates.some((a) => a.type === "BUY_OPPORTUNITY");
    for (const rec of input.allocationPlan.recommendations) {
      if (rec.action !== "buy" && rec.action !== "add") continue;
      const exists = candidates.some(
        (a) => a.type === "BUY_OPPORTUNITY" && a.symbol === rec.ticker,
      );
      if (exists) continue;
      candidates.push(toAllocationBuy(rec, !haveBuy));
    }
  }

  // --- 3. HOLD_CASH ---
  const defensive = input.regime?.stance === "DEFENSIVE";
  const highRisk =
    input.risk.overallSeverity === "high" ||
    input.risk.overallSeverity === "critical";
  if (
    (defensive && input.cashShare >= cashThreshold) ||
    (highRisk && input.cashShare >= cashThreshold)
  ) {
    candidates.push(buildHoldCash(input, cashThreshold));
  }

  // --- 4. DO_NOTHING fallback ---
  if (candidates.length === 0) {
    candidates.push(buildDoNothing(input));
  }

  // Sorteer op urgency desc → confidence desc → type-rank desc → id.
  // Bij CONSERVATIVE-profiel gebruiken we de risk-averse type-rank
  // tabel (RISK_REDUCTION krijgt extra voorrang).
  const typeRank = riskAverse ? TYPE_RANK_RISK_AVERSE : TYPE_RANK_DEFAULT;
  candidates.sort((a, b) => {
    const u = URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency];
    if (u !== 0) return u;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const t = typeRank[b.type] - typeRank[a.type];
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });

  return candidates.slice(0, max);
}

/**
 * Map de regime-stance naar de tier-input voor `computeRedeploy`. We
 * gebruiken `score`-bands wanneer beschikbaar (regime-engine output)
 * met een fallback op de directe stance. UNKNOWN/null → NEUTRAL als
 * default (80% redeploy).
 */
function mapStanceTier(
  regime: MarketRegimeScore | null | undefined,
): RegimeStanceTier {
  if (!regime) return "NEUTRAL";
  if (regime.stance === "RISK_ON") return "RISK_ON";
  if (regime.stance === "DEFENSIVE") return "DEFENSIVE";
  return "NEUTRAL";
}

// ============================================================
//  Builders per type (pure)
// ============================================================

function toRiskAction(
  action: PositionAction,
  recs: RebalanceRecommendation[],
  assetClassByTicker: Map<string, AssetClass> | undefined,
  riskAverse: boolean,
): DashboardAction | null {
  // Hergebruik rebalance-quantityPlan voor de letterlijke afbouw-tekst.
  const rec = recs.find((r) => r.ticker === action.symbol) ?? null;
  const plan = rec?.quantityPlan ?? action.quantityPlan ?? null;

  // Eerst de plan-quantity, anders de action-engine quantity.
  const planShares = plan?.sharesToSell ?? 0;
  const planAmount = plan?.amountToSell ?? 0;
  const shares = planShares > 0 ? planShares : action.sharesToSell;
  const amount = planAmount > 0 ? planAmount : action.amount;

  // **Anti-tegenstrijdigheid (Fix A).** Drop de kaart wanneer noch het
  // rebalance-plan noch de action-engine een zinvol aantal/bedrag
  // produceert — dan zou de UI "Verkoop NAAM" tonen onder een uitleg die
  // zegt dat verkoop niet nodig is. Een SELL zonder hoeveelheid is geen
  // beslissing waar de gebruiker iets mee kan.
  if (shares <= 0 && amount <= 0) {
    return null;
  }

  const assetClass = assetClassByTicker?.get(action.symbol) ?? null;
  const unitNoun = unitNounFor(assetClass, shares);
  const title =
    shares > 0
      ? action.action === "SELL"
        ? `Verkoop ${formatShares(shares)} ${unitNoun} ${action.name}`
        : `Bouw ${action.name} met ${formatShares(shares)} ${unitNoun} af`
      : action.action === "SELL"
        ? `Bouw ${action.name} af voor ~€${Math.round(amount).toLocaleString("nl-NL")}`
        : `Bouw ${action.name} af voor ~€${Math.round(amount).toLocaleString("nl-NL")}`;

  // **Description (Fix A).** De action-engine kent de daadwerkelijke
  // SELL-trigger (factor-engine, risk-engine, …). De rebalance-engine
  // ziet alleen gewicht-vs-cap. Wanneer beide het oneens zijn (rebalance
  // zegt "geen verkoop nodig" terwijl action-engine SELL emit op
  // risk-as), is de action-rationale de juiste uitleg. We pakken
  // rebalance-reason ALLEEN wanneer 'em consistent is met SELL
  // (sharesToSell > 0 in de plan).
  const description =
    planShares > 0 && plan?.reason && plan.reason.trim().length > 0
      ? plan.reason
      : action.rationale;

  // Risk-averse profiel: bevorder MEDIUM-urgency RISK-acties naar HIGH
  // zodat ze ook de urgency-sortering winnen. LOW blijft LOW.
  const urgency: DashboardActionUrgency =
    riskAverse && action.urgency === "MEDIUM" ? "HIGH" : action.urgency;

  // Zorg dat triggerSources altijd 'action-engine' bevat wanneer geen
  // bron expliciet meegegeven is — empty list zou misleidend zijn voor
  // de UI-badge.
  const triggerSources: ActionSource[] =
    action.sources && action.sources.length > 0
      ? action.sources
      : ["risk-engine"];

  return {
    id: `RISK_REDUCTION:${action.symbol}`,
    type: "RISK_REDUCTION",
    title,
    description,
    urgency,
    amount: amount > 0 ? Math.round(amount) : undefined,
    shares: shares > 0 ? shares : undefined,
    symbol: action.symbol,
    confidence: action.confidence,
    reason: action.riskImpact || action.rationale,
    sourceEngine: planShares > 0 && rec ? "rebalance-engine" : "action-engine",
    triggerSources,
  };
}

function toBuyAction(
  action: PositionAction,
  assetClassByTicker: Map<string, AssetClass> | undefined,
): DashboardAction {
  const shares = action.sharesToBuy > 0 ? action.sharesToBuy : undefined;
  const amount = action.amount > 0 ? Math.round(action.amount) : undefined;
  // Asset-class wordt nu nog niet in BUY-titles gebruikt (alleen
  // bedrag in EUR), maar we accepteren de map zodat toekomstige
  // titel-formats consistent toegang hebben.
  void assetClassByTicker;
  const title =
    amount !== undefined
      ? `Koop deze maand ${formatEur(amount)} ${action.name}`
      : `Koop ${action.name}`;

  return {
    id: `BUY_OPPORTUNITY:${action.symbol}`,
    type: "BUY_OPPORTUNITY",
    title,
    description: action.rationale,
    urgency: action.urgency,
    amount,
    shares,
    symbol: action.symbol,
    confidence: action.confidence,
    reason: action.riskImpact || action.rationale,
    sourceEngine: "action-engine",
  };
}

function toAllocationBuy(
  rec: AllocationPlan["recommendations"][number],
  primary: boolean,
): DashboardAction {
  const symbol = rec.ticker;
  const name = rec.name ?? rec.ticker;
  const amount = Math.round(rec.suggestedAmount);
  const title = `Koop deze maand ${formatEur(amount)} ${name}`;
  return {
    id: `BUY_OPPORTUNITY:${symbol}`,
    type: "BUY_OPPORTUNITY",
    title,
    description: rec.rationale[0] ?? "Maandelijks bijkopen volgens allocatie-plan.",
    urgency: primary ? "MEDIUM" : "LOW",
    amount,
    shares: rec.suggestedQuantity,
    symbol,
    confidence: rec.convictionScore,
    reason: rec.rationale.join(" "),
    sourceEngine: "allocation-engine",
  };
}

function buildHoldCash(
  input: BuildDashboardActionsInput,
  threshold: number,
): DashboardAction {
  const cashPct = Math.round(input.cashShare * 100);
  const thresholdPct = Math.round(threshold * 100);
  const defensive = input.regime?.stance === "DEFENSIVE";
  const reason = defensive
    ? `Marktregime defensief; cash op ${cashPct}% (boven jouw drempel ${thresholdPct}%) is een prudente buffer.`
    : `Risico is ${input.risk.overallSeverity}; cash op ${cashPct}% (boven drempel ${thresholdPct}%) biedt buffer.`;
  return {
    id: "HOLD_CASH:global",
    type: "HOLD_CASH",
    title: `Houd cash aan: ${cashPct}% van portefeuille als buffer`,
    description: reason,
    urgency: "LOW",
    confidence: 0.65,
    reason,
    sourceEngine: defensive ? "market-regime" : "risk-engine",
  };
}

function buildDoNothing(
  input: BuildDashboardActionsInput,
): DashboardAction {
  const reason = composeDoNothingReason(input);
  return {
    id: "DO_NOTHING:global",
    type: "DO_NOTHING",
    title: "Doe niets",
    description: reason,
    urgency: "LOW",
    confidence: 0.5,
    reason,
    sourceEngine: "action-engine",
  };
}

function composeDoNothingReason(
  input: BuildDashboardActionsInput,
): string {
  const parts: string[] = [];
  if (input.regime?.stance === "DEFENSIVE") {
    parts.push("marktregime defensief");
  }
  if (
    input.risk.overallSeverity === "high" ||
    input.risk.overallSeverity === "critical"
  ) {
    parts.push("risico al hoog");
  }
  if (parts.length === 0) {
    return "Geen sterke trigger uit de engines — portefeuille zit binnen profiel.";
  }
  return `Doe niets: ${parts.join(" en ")}.`;
}

// ============================================================
//  Format helpers — pure
// ============================================================

function formatShares(shares: number): string {
  if (Number.isInteger(shares)) return shares.toString();
  return shares.toFixed(2);
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Unit-noun resolver gebaseerd op `Holding.assetClass` — accurater
 * dan een ticker-suffix-heuristiek. Conventies:
 *  - EQUITY / REIT  → "aandeel" / "aandelen"
 *  - ETF            → "unit" / "units"
 *  - BOND           → "obligatie" / "obligaties"
 *  - COMMODITY      → "stuk" / "stuks"
 *  - CRYPTO         → "coin" / "coins"
 *  - CASH / OTHER / null → "stuks" als veilige default
 */
function unitNounFor(
  assetClass: AssetClass | null,
  shares: number,
): string {
  const singular = shares === 1;
  switch (assetClass) {
    case "EQUITY":
    case "REIT":
      return singular ? "aandeel" : "aandelen";
    case "ETF":
      return singular ? "unit" : "units";
    case "BOND":
      return singular ? "obligatie" : "obligaties";
    case "COMMODITY":
      return "stuks";
    case "CRYPTO":
      return singular ? "coin" : "coins";
    case "CASH":
    case "OTHER":
    default:
      return "stuks";
  }
}
