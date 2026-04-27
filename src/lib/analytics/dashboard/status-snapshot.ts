import type { BenchmarkReport, TaxReport } from "@/lib/analytics";
import type { Currency } from "@/types/common";
import type { MarketRegimeScore, MarketRegimeStance } from "@/types/regime";
import type { PortfolioRiskSummary, RiskSeverity } from "@/types/risk";
import type {
  HealthGrade,
  PortfolioHealthSummary,
  PortfolioSummary,
} from "@/types/summary";

/**
 * Status snapshot — pure aggregator voor de compacte statusrij op het
 * dashboard. Geen rekenwerk in UI; alle 5 kaarten komen kant-en-klaar
 * uit `buildPortfolioStatusSnapshot`.
 *
 * Kaarten:
 *  1. Totale portefeuillewaarde
 *  2. Portfolio health score
 *  3. Portfolio vs benchmark (alpha)
 *  4. Netto rendement indicatief (na tax + WHT)
 *  5. Market regime
 *
 * Output per kaart bevat label, value, subValue, status-tier (GOOD/
 * NEUTRAL/WARNING/CRITICAL), confidence (0..1) en een korte
 * explanation-zin. Bij missende data → status NEUTRAL +
 * `missingDataReason`.
 *
 * Geen AI. Geen externe state. Alle thresholds zijn constants.
 */

// ============================================================
//  Types
// ============================================================

export type StatusTier = "GOOD" | "NEUTRAL" | "WARNING" | "CRITICAL";

export type StatusCardId =
  | "TOTAL_VALUE"
  | "HEALTH_SCORE"
  | "VS_BENCHMARK"
  | "NET_RETURN"
  | "MARKET_REGIME";

export interface StatusMetric {
  id: StatusCardId;
  label: string;
  /** Hoofdwaarde, al-geformatteerd voor weergave (bv. "€ 100.000"). */
  value: string;
  /** Optionele tweede regel (bv. "+2.1% vs vorige maand"). */
  subValue?: string;
  status: StatusTier;
  /** 0..1 — daalt bij missende data of beperkte coverage. */
  confidence: number;
  /** 1-zin uitleg waarom deze tier (NL). */
  explanation: string;
  /** Reden voor "nog niet beschikbaar" — alleen wanneer status = NEUTRAL en data leeg. */
  missingDataReason?: string;
}

export interface PortfolioStatusSnapshot {
  baseCurrency: Currency;
  cards: StatusMetric[];
}

// ============================================================
//  Drempels (expliciet)
// ============================================================

const HEALTH_GRADE_TIER: Record<HealthGrade, StatusTier> = {
  A: "GOOD",
  B: "GOOD",
  C: "NEUTRAL",
  D: "WARNING",
  F: "CRITICAL",
};

const RISK_TIER: Record<RiskSeverity, StatusTier> = {
  low: "GOOD",
  moderate: "NEUTRAL",
  elevated: "WARNING",
  high: "CRITICAL",
  critical: "CRITICAL",
};

const ALPHA_GOOD = 0.02; // ≥ +2% alpha = GOOD
const ALPHA_NEUTRAL = -0.02; // ≥ -2% = NEUTRAL
const ALPHA_WARNING = -0.05; // ≥ -5% = WARNING; daaronder CRITICAL

const PNL_PCT_GOOD = 0.05; // ≥ +5% = GOOD
const PNL_PCT_WARNING = -0.05; // ≤ -5% = WARNING
const PNL_PCT_CRITICAL = -0.15; // ≤ -15% = CRITICAL

const NET_RETURN_GOOD = 0.04; // ≥ 4% netto-jaar = GOOD
const NET_RETURN_NEUTRAL = 0; // ≥ 0% = NEUTRAL
const NET_RETURN_WARNING = -0.05; // ≥ -5% = WARNING; lager = CRITICAL

// ============================================================
//  Input + builder
// ============================================================

export interface BuildPortfolioStatusInput {
  summary: PortfolioSummary;
  health: PortfolioHealthSummary;
  risk: PortfolioRiskSummary;
  benchmark: BenchmarkReport | null;
  tax: TaxReport | null;
  regime: MarketRegimeScore | null;
}

export function buildPortfolioStatusSnapshot(
  input: BuildPortfolioStatusInput,
): PortfolioStatusSnapshot {
  return {
    baseCurrency: input.summary.baseCurrency,
    cards: [
      buildTotalValueCard(input),
      buildHealthCard(input),
      buildBenchmarkCard(input),
      buildNetReturnCard(input),
      buildRegimeCard(input),
    ],
  };
}

// ============================================================
//  Card builders (pure)
// ============================================================

function buildTotalValueCard(
  input: BuildPortfolioStatusInput,
): StatusMetric {
  const s = input.summary;
  const pnlPct = s.unrealizedPnlPct ?? null;
  const tier = derivePnlTier(pnlPct);
  const explanation = buildTotalValueExplanation(pnlPct, input.risk);

  return {
    id: "TOTAL_VALUE",
    label: "Portefeuillewaarde",
    value: formatCurrency(s.totalValue, s.baseCurrency),
    subValue:
      s.unrealizedPnl !== null && pnlPct !== null
        ? `${pnlPct >= 0 ? "+" : ""}${(pnlPct * 100).toFixed(1)}% (${formatCurrency(
            s.unrealizedPnl,
            s.baseCurrency,
          )})`
        : undefined,
    status: tier,
    confidence: s.totalValue > 0 ? 0.95 : 0.4,
    explanation,
  };
}

function buildHealthCard(input: BuildPortfolioStatusInput): StatusMetric {
  const h = input.health;
  const tier = HEALTH_GRADE_TIER[h.grade];
  const explanation = buildHealthExplanation(h);

  return {
    id: "HEALTH_SCORE",
    label: "Health score",
    value: `${h.grade} · ${Math.round(h.score)}/100`,
    subValue:
      h.signals.length > 0
        ? `${h.signals.length} signal${h.signals.length === 1 ? "" : "s"} actief`
        : undefined,
    status: tier,
    confidence: 0.9,
    explanation,
  };
}

function buildBenchmarkCard(
  input: BuildPortfolioStatusInput,
): StatusMetric {
  const b = input.benchmark;
  if (!b || b.performance.monthsObserved === 0) {
    return {
      id: "VS_BENCHMARK",
      label: "vs benchmark",
      value: "—",
      status: "NEUTRAL",
      confidence: 0.2,
      explanation:
        "Benchmark-vergelijking is nog niet beschikbaar — onvoldoende overlap of data ontbreekt.",
      missingDataReason: !b
        ? "Geen benchmark-data opgehaald."
        : "Te weinig overlappende observaties.",
    };
  }
  const alpha = b.performance.alpha;
  const tier = deriveAlphaTier(alpha);
  const sign = alpha >= 0 ? "+" : "";
  return {
    id: "VS_BENCHMARK",
    label: `vs ${b.performance.benchmark.label}`,
    value: `${sign}${(alpha * 100).toFixed(1)}%`,
    subValue: `Afwijking ±${(b.performance.trackingError * 100).toFixed(1)}% · ${b.performance.monthsObserved} maanden data`,
    status: tier,
    confidence: clamp01(0.4 + b.performance.monthsObserved / 36),
    explanation: buildAlphaExplanation(alpha, b.performance.benchmark.label),
  };
}

function buildNetReturnCard(
  input: BuildPortfolioStatusInput,
): StatusMetric {
  const t = input.tax;
  if (!t) {
    return {
      id: "NET_RETURN",
      label: "Netto rendement",
      value: "—",
      status: "NEUTRAL",
      confidence: 0.2,
      explanation:
        "Indicatief netto rendement is nog niet beschikbaar — tax-engine output ontbreekt.",
      missingDataReason: "Tax-engine output ontbreekt.",
    };
  }
  const r = t.result;
  const tier = deriveNetReturnTier(r.netReturn);
  return {
    id: "NET_RETURN",
    label: "Netto rendement",
    value: formatPct(r.netReturn),
    subValue: `bruto ${formatPct(r.grossReturn)} · belasting ${formatPct(r.taxImpact)}`,
    status: tier,
    confidence: clamp01(r.confidence),
    explanation: buildNetReturnExplanation(r.netReturn, r.taxImpact),
  };
}

function buildRegimeCard(input: BuildPortfolioStatusInput): StatusMetric {
  const r = input.regime;
  if (!r) {
    return {
      id: "MARKET_REGIME",
      label: "Marktregime",
      value: "—",
      status: "NEUTRAL",
      confidence: 0.2,
      explanation:
        "Marktregime is nog niet beschikbaar — fetch faalde of data is nog niet gepubliceerd.",
      missingDataReason: "Geen recente regime-data.",
    };
  }
  const tier = deriveRegimeTier(r.stance, input.risk.overallSeverity);
  return {
    id: "MARKET_REGIME",
    label: "Marktregime",
    value: r.stance,
    subValue: `${Math.round(r.score)}/100 · risico ${input.risk.overallSeverity}`,
    status: tier,
    confidence: clamp01(r.confidence ?? 0.6),
    explanation: buildRegimeExplanation(r.stance, input.risk.overallSeverity),
  };
}

// ============================================================
//  Tier-derivers (pure)
// ============================================================

function derivePnlTier(pnlPct: number | null): StatusTier {
  if (pnlPct === null || !Number.isFinite(pnlPct)) return "NEUTRAL";
  if (pnlPct >= PNL_PCT_GOOD) return "GOOD";
  if (pnlPct <= PNL_PCT_CRITICAL) return "CRITICAL";
  if (pnlPct <= PNL_PCT_WARNING) return "WARNING";
  return "NEUTRAL";
}

function deriveAlphaTier(alpha: number): StatusTier {
  if (alpha >= ALPHA_GOOD) return "GOOD";
  if (alpha >= ALPHA_NEUTRAL) return "NEUTRAL";
  if (alpha >= ALPHA_WARNING) return "WARNING";
  return "CRITICAL";
}

function deriveNetReturnTier(netReturn: number): StatusTier {
  if (netReturn >= NET_RETURN_GOOD) return "GOOD";
  if (netReturn >= NET_RETURN_NEUTRAL) return "NEUTRAL";
  if (netReturn >= NET_RETURN_WARNING) return "WARNING";
  return "CRITICAL";
}

/**
 * Regime → tier: defensief regime + hoog risico = WARNING/CRITICAL.
 * Risk-on/expansion + laag risico = GOOD.
 */
function deriveRegimeTier(
  stance: MarketRegimeStance,
  riskSeverity: RiskSeverity,
): StatusTier {
  const riskTier = RISK_TIER[riskSeverity];
  if (stance === "DEFENSIVE") {
    if (riskTier === "CRITICAL") return "CRITICAL";
    if (riskTier === "WARNING") return "WARNING";
    return "WARNING"; // defensief regime alleen al = WARNING
  }
  if (stance === "RISK_ON") {
    if (riskTier === "CRITICAL") return "WARNING"; // risk-on + hoog risico = mismatch
    return "GOOD";
  }
  // NEUTRAL stance
  return riskTier === "CRITICAL" ? "WARNING" : "NEUTRAL";
}

// ============================================================
//  Explanation builders (NL templates, geen LLM)
// ============================================================

function buildTotalValueExplanation(
  pnlPct: number | null,
  risk: PortfolioRiskSummary,
): string {
  if (pnlPct === null) {
    return "Portefeuille-waarde wordt getoond; nog geen P&L-data om de status te kleuren.";
  }
  const pct = `${pnlPct >= 0 ? "+" : ""}${(pnlPct * 100).toFixed(1)}%`;
  if (pnlPct >= PNL_PCT_GOOD) {
    return `P&L sinds aankoop staat op ${pct} — solide basis bij risk-severity ${risk.overallSeverity}.`;
  }
  if (pnlPct <= PNL_PCT_CRITICAL) {
    return `P&L sinds aankoop staat op ${pct} — substantiële drawdown; check of allocatie nog past bij je profiel.`;
  }
  if (pnlPct <= PNL_PCT_WARNING) {
    return `P&L sinds aankoop staat op ${pct} — onder de waarschuwingsdrempel.`;
  }
  return `P&L sinds aankoop staat op ${pct} — binnen normale schommeling.`;
}

function buildHealthExplanation(h: PortfolioHealthSummary): string {
  if (h.grade === "A") return "Diversificatie, kwaliteit en risk-alignment lopen synchroon.";
  if (h.grade === "B") return "Solide health-grade; kleine verbetering mogelijk op één van de pillars.";
  if (h.grade === "C") return "Health is gemiddeld — controleer welke pillar onder druk staat.";
  if (h.grade === "D") return "Health onder profiel — meerdere signals actief, kijk naar /risico.";
  return "Health is kritiek — engines vinden meerdere structurele afwijkingen.";
}

function buildAlphaExplanation(alpha: number, label: string): string {
  if (alpha >= ALPHA_GOOD) {
    return `Portefeuille loopt ${(alpha * 100).toFixed(1)}% voor op ${label}.`;
  }
  if (alpha >= ALPHA_NEUTRAL) {
    return `Portefeuille beweegt ongeveer gelijk op met ${label}.`;
  }
  if (alpha >= ALPHA_WARNING) {
    return `Portefeuille loopt ${Math.abs(alpha * 100).toFixed(1)}% achter op ${label}.`;
  }
  return `Portefeuille loopt fors achter op ${label} (${(alpha * 100).toFixed(1)}%).`;
}

function buildNetReturnExplanation(
  netReturn: number,
  taxImpact: number,
): string {
  const taxPct = `${(taxImpact * 100).toFixed(1)}%`;
  if (netReturn >= NET_RETURN_GOOD) {
    return `Na geschatte belasting (${taxPct}) blijft het rendement positief en boven 4%-drempel.`;
  }
  if (netReturn >= NET_RETURN_NEUTRAL) {
    return `Na geschatte belasting (${taxPct}) is het rendement positief maar bescheiden.`;
  }
  if (netReturn >= NET_RETURN_WARNING) {
    return `Na geschatte belasting (${taxPct}) staat het netto rendement licht in het rood.`;
  }
  return `Na geschatte belasting (${taxPct}) staat het netto rendement fors in het rood.`;
}

function buildRegimeExplanation(
  stance: MarketRegimeStance,
  riskSeverity: RiskSeverity,
): string {
  if (stance === "DEFENSIVE") {
    return `Marktregime is defensief; risico-engine staat op ${riskSeverity} — wees voorzichtig met bijkopen.`;
  }
  if (stance === "RISK_ON") {
    return `Marktregime is risk-on; risico-engine staat op ${riskSeverity}.`;
  }
  return `Marktregime is neutraal; risico-engine staat op ${riskSeverity}.`;
}

// ============================================================
//  Helpers (pure)
// ============================================================

function formatCurrency(value: number, currency: Currency): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  const sign = fraction > 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(2)}%`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(2));
}
