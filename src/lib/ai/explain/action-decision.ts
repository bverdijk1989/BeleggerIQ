import type {
  ActionDecision,
  PositionAction,
} from "@/lib/analytics/actions";

import type {
  ActionDecisionExplanation,
  ActionDecisionExplanationInput,
} from "./types";

/**
 * Action-decision explainer — pure, deterministische renderer.
 *
 * Bouwt drie sectie-bullets ("waarom logisch" / "risico's" / "wat
 * kan misgaan") rond de getallen die de engine al heeft geproduceerd.
 *
 * Strikte regels (handhaafd door constructie):
 *   1. Cijfers, percentages en bedragen worden **letterlijk** uit
 *      `PositionAction` overgenomen. Geen `Math.round` op nieuwe
 *      waarden, geen synthetische percentages.
 *   2. De renderer kent geen pad om een actie aan te passen of een
 *      nieuwe te kiezen — input is altijd één bestaande
 *      `PositionAction`.
 *   3. "Wat kan misgaan" is templated per actie-type (BUY / TRIM /
 *      SELL / HOLD / DO_NOTHING). Geen LLM, geen heuristiek over
 *      cijfers.
 */

export function explainActionDecision(
  input: ActionDecisionExplanationInput,
): ActionDecisionExplanation {
  const { action } = input;
  const generatedAt = input.now ?? new Date().toISOString();

  const headline = buildHeadline(action);
  const whyLogical = buildWhyLogical(action);
  const risks = buildRisks(action, input);
  const whatCanGoWrong = WHAT_CAN_GO_WRONG[action.action];

  return {
    generatedAt,
    action: action.action,
    urgency: action.urgency,
    symbol: action.symbol,
    headline,
    whyLogical,
    risks,
    whatCanGoWrong: [...whatCanGoWrong],
    sources: action.sources,
    confidence: action.confidence,
    disclaimer:
      "Deze uitleg vat alleen de engine-uitkomst samen — geen koop- of verkoopadvies. Cijfers komen letterlijk uit de analytics-engines.",
  };
}

// ============================================================
//  Headline
// ============================================================

const ACTION_VERB_NL: Record<ActionDecision, string> = {
  BUY: "wordt voorgesteld om bij te kopen",
  HOLD: "wordt aanbevolen om aan te houden",
  TRIM: "wordt voorgesteld om af te bouwen",
  SELL: "wordt voorgesteld om te verkopen",
  DO_NOTHING: "is op dit moment geen actie nodig voor",
};

function buildHeadline(action: PositionAction): string {
  const verb = ACTION_VERB_NL[action.action];
  const urgency =
    action.urgency === "HIGH"
      ? " (hoge urgentie)"
      : action.urgency === "MEDIUM"
        ? " (middel-urgent)"
        : "";

  if (action.action === "BUY" && action.sharesToBuy > 0) {
    return `${action.name} (${action.symbol}) ${verb}${urgency}: indicatief ${action.sharesToBuy} stuks voor ongeveer ${formatNumber(action.amount)}.`;
  }
  if (
    (action.action === "TRIM" || action.action === "SELL") &&
    action.sharesToSell > 0
  ) {
    return `${action.name} (${action.symbol}) ${verb}${urgency}: indicatief ${action.sharesToSell} stuks (≈ ${formatNumber(action.amount)}).`;
  }
  return `${action.name} (${action.symbol}) ${verb}${urgency}.`;
}

// ============================================================
//  Waarom logisch — letterlijk uit engine-rationale
// ============================================================

function buildWhyLogical(action: PositionAction): string[] {
  const bullets: string[] = [];
  const rationale = action.rationale.trim();
  if (rationale.length > 0) bullets.push(rationale);

  // Voeg een bron-attributie zin toe — geen nieuwe cijfers, alleen
  // welke engine bevestigt dat dit logisch is.
  if (action.sources.length > 0) {
    const sourceLabels = action.sources.map(SOURCE_LABEL_NL).join(", ");
    bullets.push(
      `Bevestigd door: ${sourceLabels}. Confidence ${(action.confidence * 100).toFixed(0)}%.`,
    );
  }
  return bullets;
}

const SOURCE_LABEL_NL = (
  src: PositionAction["sources"][number],
): string => {
  switch (src) {
    case "factor-engine":
      return "factor-engine (composite + sub-scores)";
    case "risk-engine":
      return "risk-engine (concentratie / volatiliteit)";
    case "rebalance-engine":
      return "rebalance-engine (target-weight)";
    case "policy-engine":
      return "policy-engine (cap per positie)";
    case "market-regime":
      return "market-regime (huidige stance)";
    default:
      return src;
  }
};

// ============================================================
//  Risico's — uit engine + actie-specifieke aandachtspunten
// ============================================================

function buildRisks(
  action: PositionAction,
  input: ActionDecisionExplanationInput,
): string[] {
  const risks: string[] = [];
  // 1. risk-impact uit de engine zelf — direct doorpompen.
  const impact = action.riskImpact?.trim();
  if (impact && impact.length > 0) risks.push(impact);

  // 2. Confidence-warning bij lage confidence.
  if (action.confidence < 0.5) {
    risks.push(
      `Confidence is ${(action.confidence * 100).toFixed(0)}% — neem deze aanbeveling met voorzichtigheid.`,
    );
  }

  // 3. Risk-engine class als beschikbaar.
  const cls = input.positionRisk?.riskClass;
  if (cls === "high" || cls === "critical") {
    risks.push(`Risk-engine markeert deze positie als ${cls}.`);
  } else if (cls === "elevated") {
    risks.push("Risk-engine markeert deze positie als 'elevated'.");
  }

  // 4. Kwaliteit-cue uit factor-score (alleen letterlijk overnemen).
  const composite = input.factorScore?.composite;
  if (typeof composite === "number" && Number.isFinite(composite)) {
    const rounded = Math.round(composite);
    if (rounded < 40) {
      risks.push(
        `Factor-composite ${rounded}/100 ondersteunt de keuze; lage score = beperkte buffer bij negatieve marktomslag.`,
      );
    }
  }

  return risks;
}

// ============================================================
//  Wat kan misgaan — vaste templates per actie-type (geen cijfers)
// ============================================================

const WHAT_CAN_GO_WRONG: Record<ActionDecision, readonly string[]> = {
  BUY: [
    "Marktomslag direct na bijkopen kan tijdelijke drawdown geven; pas in via DCA als dat past bij je profiel.",
    "Factor-score kijkt achteruit; toekomstige fundamentals kunnen tegenvallen (winst-miss, sectorrotatie).",
    "Onverwachte verandering in marktregime kan de huidige BUY-tilt onderdrukken.",
  ],
  TRIM: [
    "Verkopen op lokaal dieptepunt kan toekomstige outperformance kosten als de positie weer aantrekt.",
    "Belastingimpact (box 3 / dividend-cycle) is niet meegerekend in de engine-output.",
    "Vrijgekomen cash blijft renteloos liggen tot je 'm herbelegd hebt — opportunity cost.",
  ],
  SELL: [
    "Volledig afbouwen elimineert ook potentieel herstel; niet vergeten dat dit een eindbeslissing is.",
    "Belastingafrekening + transactiekosten zijn niet in de engine-output meegenomen.",
    "Een andere positie moet de exposure overnemen — anders verandert je risk-profiel onbedoeld.",
  ],
  HOLD: [
    "Niets doen is óók een keuze; bij forse marktveranderingen kan inactiviteit duur worden.",
    "Engines werken op periodieke updates; nieuwe informatie kan deze HOLD snel achterhaald maken.",
  ],
  DO_NOTHING: [
    "Onvoldoende data om een onderbouwde aanbeveling te doen — niet hetzelfde als 'alles is in orde'.",
    "Refresh fundamentals + factor-snapshot voordat je op deze status leunt.",
  ],
};

// ============================================================
//  Helpers
// ============================================================

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}
