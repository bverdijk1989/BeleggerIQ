import type {
  RebalancePlan,
  RebalanceQuantityPlan,
  RebalanceRecommendation,
} from "@/types/rebalance";
import type {
  PortfolioRiskSummary,
  RiskFlag,
  RiskSeverity,
} from "@/types/risk";

/**
 * Shared attention-builder. Bouwt een geprioriteerde "wat vraagt aandacht"
 * lijst uit risk-engine flags en rebalance-engine acties. Wordt gebruikt
 * door zowel /risico als het dashboard.
 *
 * Sorteervolgorde:
 *  1. RECONSIDER rebalance (het profiel past niet meer)
 *  2. TRIM_HEAVY rebalance
 *  3. Risk flags met severity "high" of "critical"
 *  4. Risk flags met severity "moderate"/"elevated"
 *  5. TRIM_LIGHT rebalance
 *
 * Laag-niveau informatieve flags (severity "low") worden overgeslagen zodat
 * de lijst rustig blijft.
 */

export type AttentionSeverity = "moderate" | "high" | "critical";

export interface AttentionItem {
  id: string;
  label: string;
  message: string;
  severity: AttentionSeverity;
  category: "risk" | "rebalance";
  metric?: number;
  /**
   * Concrete afbouw-quantity uit de rebalance-engine (verkoop X stuks voor
   * circa €Y). Alleen gezet voor `rebalance`-items; door-gegeven vanuit
   * `RebalanceRecommendation.quantityPlan` zonder extra rekenen.
   */
  quantityPlan?: RebalanceQuantityPlan;
}

export function buildAttentionItems(
  risk: PortfolioRiskSummary,
  rebalance: RebalancePlan,
  limit = 6,
): AttentionItem[] {
  const items: Array<AttentionItem & { priority: number }> = [];

  for (const rec of rebalance.recommendations) {
    const entry = fromRebalance(rec);
    if (entry) items.push(entry);
  }

  for (const flag of risk.flags) {
    const entry = fromRiskFlag(flag);
    if (entry) items.push(entry);
  }

  items.sort((a, b) => b.priority - a.priority);
  return items.slice(0, limit).map(({ priority: _, ...item }) => item);
}

export function countAttentionBySeverity(
  items: AttentionItem[],
): Record<AttentionSeverity, number> {
  const counts: Record<AttentionSeverity, number> = {
    moderate: 0,
    high: 0,
    critical: 0,
  };
  for (const item of items) counts[item.severity] += 1;
  return counts;
}

// ============================================================
//  Internals
// ============================================================

function fromRebalance(
  rec: RebalanceRecommendation,
): (AttentionItem & { priority: number }) | null {
  // Zet het quantityPlan direct door — UI leest sharesToSell, amountToSell,
  // postSellWeight en confidence uit hetzelfde object dat de rebalance-
  // engine heeft geproduceerd. Geen vertaling, geen afronding in deze laag.
  const quantityPlan = rec.quantityPlan;
  switch (rec.action) {
    case "RECONSIDER":
      return {
        id: `rebalance.${rec.ticker}.reconsider`,
        label: `${rec.name}: heroverwegen`,
        message:
          quantityPlan?.reason ??
          rec.reasons[0] ??
          "Zwak profiel — positie past mogelijk niet bij je strategie.",
        severity: "critical",
        category: "rebalance",
        metric: rec.fragilityScore,
        quantityPlan,
        priority: 100,
      };
    case "TRIM_HEAVY":
      return {
        id: `rebalance.${rec.ticker}.heavy`,
        label: `${rec.name}: stevig afbouwen`,
        message:
          quantityPlan?.reason ??
          rec.reasons[0] ??
          "Fragiele concentratie boven drempel — breng terug naar target.",
        severity: "high",
        category: "rebalance",
        metric: rec.currentWeight,
        quantityPlan,
        priority: 80,
      };
    case "TRIM_LIGHT":
      return {
        id: `rebalance.${rec.ticker}.light`,
        label: `${rec.name}: licht afbouwen`,
        message:
          quantityPlan?.reason ??
          rec.reasons[0] ??
          "Positie boven target — een stap richting cap volstaat.",
        severity: "moderate",
        category: "rebalance",
        metric: rec.currentWeight,
        quantityPlan,
        priority: 30,
      };
    case "NO_ACTION":
    default:
      return null;
  }
}

function fromRiskFlag(
  flag: RiskFlag,
): (AttentionItem & { priority: number }) | null {
  if (flag.severity === "low") return null;
  const attentionSeverity = mapSeverity(flag.severity);
  const priority =
    attentionSeverity === "critical"
      ? 70
      : attentionSeverity === "high"
        ? 60
        : 40;

  return {
    id: `risk.${flag.code}`,
    label: flag.label,
    message: flag.message ?? "Zie details op de risicopagina.",
    severity: attentionSeverity,
    category: "risk",
    metric: flag.metric,
    priority,
  };
}

function mapSeverity(severity: RiskSeverity): AttentionSeverity {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  return "moderate";
}
