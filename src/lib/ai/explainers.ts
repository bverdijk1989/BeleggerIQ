import type {
  BuyPlanContext,
  ExplainConfidence,
  ExplainContext,
  ExplainResponse,
  FragileConcentrationContext,
  HoldingScoreContext,
  MarketRegimeContext,
  PortfolioRisksContext,
} from "@/types/ai";
import type { AllocationRecommendation } from "@/types/allocation";
import type { FactorSubScores } from "@/types/factor";
import type { MarketRegimeStance } from "@/types/regime";
import type { RiskSeverity } from "@/types/risk";

/**
 * Deterministic explainers — template-based narrative generatie bovenop
 * engine-outputs. GEEN externe LLM call; hierdoor is per constructie
 * uitgesloten dat er nieuwe cijfers verzonnen worden.
 *
 * Alle strings die numerieke waardes bevatten komen direct uit de
 * `ExplainContext`. Rangorde en classificatie worden letterlijk
 * overgenomen — de explainer voegt alleen narratief commentaar toe.
 *
 * Later kan deze laag via een `LlmClient` achter dezelfde API een
 * LLM-output leveren met exact dezelfde contract-shape.
 */

export function explain(context: ExplainContext): ExplainResponse {
  switch (context.useCase) {
    case "holding_score":
      return explainHoldingScore(context);
    case "fragile_concentration":
      return explainFragileConcentration(context);
    case "buy_plan":
      return explainBuyPlan(context);
    case "market_regime":
      return explainMarketRegime(context);
    case "portfolio_risks":
      return explainPortfolioRisks(context);
  }
}

// ============================================================
//  Holding score
// ============================================================

export function explainHoldingScore(
  ctx: HoldingScoreContext,
): ExplainResponse {
  const fs = ctx.factorScore;
  const composite = Math.round(fs.composite);
  const grade = gradeFromScore(composite);
  const confidence = confidenceTier(fs.confidence ?? 0);

  const entries = factorEntries(fs.subScores, fs.rationales);
  const strong = entries.filter((e) => e.score >= 65);
  const weak = entries.filter((e) => e.score <= 35);

  const headline = `${ctx.name} (${ctx.ticker}) · composite ${composite}/100 — ${grade}`;

  const narrativeParts: string[] = [];
  narrativeParts.push(
    `Composite ${composite}/100 — ${grade} profiel volgens de factor engine.`,
  );
  if (strong.length > 0) {
    const top = strong[0]!;
    narrativeParts.push(
      `${top.label} (${Math.round(top.score)}) trekt de score omhoog.`,
    );
  }
  if (weak.length > 0) {
    const bottom = weak[0]!;
    narrativeParts.push(
      `${bottom.label} (${Math.round(bottom.score)}) drukt de score.`,
    );
  }
  if (confidence === "low") {
    narrativeParts.push(
      "Coverage is beperkt — behandel dit oordeel met terughoudendheid.",
    );
  }

  const bulletsSource = [...strong.slice(0, 2), ...weak.slice(0, 1)];
  const bullets = bulletsSource.map((entry) =>
    entry.rationale
      ? `${entry.label} ${Math.round(entry.score)}/100 — ${entry.rationale}`
      : `${entry.label} ${Math.round(entry.score)}/100`,
  );

  return {
    useCase: "holding_score",
    headline,
    narrative: narrativeParts.join(" "),
    bullets,
    confidence,
    usedContextKeys: [
      "factorScore.composite",
      "factorScore.subScores",
      "factorScore.rationales",
      "factorScore.confidence",
    ],
    disclaimer:
      confidence === "low"
        ? "Beperkte datacoverage — score is indicatief."
        : undefined,
  };
}

// ============================================================
//  Fragile concentration
// ============================================================

export function explainFragileConcentration(
  ctx: FragileConcentrationContext,
): ExplainResponse {
  const weightPct = Math.round(ctx.positionWeight * 100);
  const capPct = Math.round(ctx.maxPositionWeight * 100);
  const overCap = ctx.positionWeight > ctx.maxPositionWeight;
  const overCapBy = Math.round(
    (ctx.positionWeight - ctx.maxPositionWeight) * 100,
  );

  const typeLabel = {
    HEALTHY: "HEALTHY — gezonde concentratie",
    NEUTRAL: "NEUTRAL — neutrale concentratie",
    FRAGILE: "FRAGILE — fragiele concentratie",
  }[ctx.concentrationType];

  const headline = `${ctx.name} (${ctx.ticker}) · ${typeLabel}`;

  const parts: string[] = [];
  parts.push(
    `${ctx.name} weegt ${weightPct}% — policy-cap is ${capPct}%.`,
  );
  if (overCap) {
    parts.push(`Dat is ${overCapBy} procentpunt boven de cap.`);
  }
  parts.push(`Fragility-score ${Math.round(ctx.fragilityScore)}/100.`);

  if (ctx.concentrationType === "HEALTHY") {
    parts.push(
      "Sterke factor- en risicosignalen: laat deze winner voorlopig doorlopen.",
    );
  } else if (ctx.concentrationType === "FRAGILE") {
    parts.push(
      "De combinatie van gewicht en zwakke signalen maakt deze positie kwetsbaar.",
    );
  }

  const bullets = ctx.reasons.slice(0, 4);
  const confidence: ExplainConfidence =
    ctx.reasons.length >= 3 ? "high" : ctx.reasons.length >= 1 ? "medium" : "low";

  return {
    useCase: "fragile_concentration",
    headline,
    narrative: parts.join(" "),
    bullets,
    confidence,
    usedContextKeys: [
      "positionWeight",
      "maxPositionWeight",
      "concentrationType",
      "fragilityScore",
      "reasons",
    ],
  };
}

// ============================================================
//  Buy plan
// ============================================================

export function explainBuyPlan(ctx: BuyPlanContext): ExplainResponse {
  const plan = ctx.plan;
  const recs = plan.recommendations;
  const budget = plan.budget ?? plan.monthlyContribution;
  const deployed = plan.deployedAmount ?? 0;
  const cashReserved = plan.cashReserved ?? 0;

  const headline =
    recs.length > 0
      ? `${recs.length} koopaanbeveling${recs.length === 1 ? "" : "en"} voor ${formatCurrency(deployed, plan.baseCurrency)}`
      : "Geen koopacties deze cyclus";

  const parts: string[] = [];
  parts.push(
    `Budget ${formatCurrency(budget, plan.baseCurrency)}; ingezet ${formatCurrency(deployed, plan.baseCurrency)}; cash achtergehouden ${formatCurrency(cashReserved, plan.baseCurrency)}.`,
  );
  if (ctx.regime) {
    parts.push(
      `Marktregime is ${stanceLabel(ctx.regime.stance)} (score ${ctx.regime.score}/100) — dit stuurt de factor-bias.`,
    );
  }
  if (recs.length === 0) {
    parts.push(
      plan.warnings?.[0] ??
        "Geen kandidaten voldeden aan de minimum-criteria.",
    );
  } else {
    const top = recs[0]!;
    parts.push(
      `Hoogste prioriteit: ${top.name ?? top.ticker}${top.priority !== undefined ? ` (priority ${top.priority}/100)` : ""}.`,
    );
  }
  if (plan.coreEtfUsed) {
    parts.push("Core-ETF fallback is actief voor extra spreiding.");
  }

  const bullets = recs
    .slice(0, 4)
    .map((rec) => formatRecommendationLine(rec, plan.baseCurrency));

  const confidence = computeBuyPlanConfidence(plan.recommendations);

  return {
    useCase: "buy_plan",
    headline,
    narrative: parts.join(" "),
    bullets,
    confidence,
    usedContextKeys: [
      "plan.budget",
      "plan.deployedAmount",
      "plan.cashReserved",
      "plan.recommendations",
      "plan.warnings",
      "plan.coreEtfUsed",
      "regime.stance",
      "regime.score",
    ],
    disclaimer:
      (plan.warnings?.length ?? 0) > 0
        ? "Plan bevat waarschuwingen — lees ze op /maandbeslissing."
        : undefined,
  };
}

// ============================================================
//  Market regime
// ============================================================

export function explainMarketRegime(
  ctx: MarketRegimeContext,
): ExplainResponse {
  const r = ctx.regime;
  const stance = stanceLabel(r.stance);
  const coverage = Math.round(r.confidence * 100);
  const confidence = confidenceTier(r.confidence);

  const headline = `Marktregime: ${stance} (score ${r.score}/100)`;

  const active = r.subDrivers.filter(
    (d): d is typeof d & { score: number } =>
      d.score !== null && Number.isFinite(d.score),
  );
  const strong = active.filter((d) => d.score >= 60);
  const weak = active.filter((d) => d.score <= 40);

  const parts: string[] = [r.narrative || `Stance is ${stance}.`];
  parts.push(`Coverage ${coverage}% van de drivers.`);
  if (strong.length > 0 && weak.length > 0) {
    parts.push(
      `${strong[0]!.label} ondersteunt; ${weak[0]!.label} trekt tegen.`,
    );
  }

  const bullets = active
    .slice()
    .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50))
    .slice(0, 3)
    .map((d) =>
      d.rationale
        ? `${d.label} ${Math.round(d.score)}/100 — ${d.rationale}`
        : `${d.label} ${Math.round(d.score)}/100`,
    );

  return {
    useCase: "market_regime",
    headline,
    narrative: parts.join(" "),
    bullets,
    confidence,
    usedContextKeys: [
      "regime.stance",
      "regime.score",
      "regime.confidence",
      "regime.narrative",
      "regime.subDrivers",
    ],
    disclaimer:
      confidence === "low"
        ? "Regime-oordeel is gebaseerd op beperkte data — extra voorzichtigheid geboden."
        : undefined,
  };
}

// ============================================================
//  Portfolio risks
// ============================================================

export function explainPortfolioRisks(
  ctx: PortfolioRisksContext,
): ExplainResponse {
  const r = ctx.risk;
  const severityLabelNl = {
    low: "Laag",
    moderate: "Gemiddeld",
    elevated: "Verhoogd",
    high: "Hoog",
    critical: "Kritiek",
  }[r.overallSeverity];

  const headline = `Risicoklasse: ${severityLabelNl}${r.riskScore !== undefined ? ` (score ${r.riskScore}/100)` : ""}`;

  const sortedFlags = r.flags
    .slice()
    .sort(
      (a, b) => severityOrder(b.severity) - severityOrder(a.severity),
    );
  const topFlags = sortedFlags.slice(0, 3);

  const parts: string[] = [];
  parts.push(
    `Grootste positie ${formatPct(r.largestPositionWeight)}; top-5 samen ${r.top5Weight !== undefined ? formatPct(r.top5Weight) : "onbekend"}.`,
  );
  if (r.foreignCurrencyExposure !== undefined) {
    parts.push(
      `Vreemde valuta ${formatPct(r.foreignCurrencyExposure)} van de portefeuille.`,
    );
  }
  if (r.topSector) {
    parts.push(
      `Sector-zwaartepunt: ${r.topSector.label} (${formatPct(r.topSector.weight)}).`,
    );
  }

  const bullets = topFlags.map((flag) =>
    flag.message ? `${flag.label} — ${flag.message}` : flag.label,
  );

  const confidence: ExplainConfidence =
    r.positions.length >= 8 ? "high" : r.positions.length >= 3 ? "medium" : "low";

  return {
    useCase: "portfolio_risks",
    headline,
    narrative: parts.join(" "),
    bullets,
    confidence,
    usedContextKeys: [
      "risk.overallSeverity",
      "risk.riskScore",
      "risk.largestPositionWeight",
      "risk.top5Weight",
      "risk.foreignCurrencyExposure",
      "risk.topSector",
      "risk.flags",
    ],
  };
}

// ============================================================
//  Helpers
// ============================================================

function factorEntries(
  sub: FactorSubScores,
  rationales?: {
    quality?: string[];
    value?: string[];
    momentum?: string[];
    lowVol?: string[];
  },
): Array<{ key: string; label: string; score: number; rationale?: string }> {
  return [
    {
      key: "quality",
      label: "Quality",
      score: sub.quality,
      rationale: rationales?.quality?.[0],
    },
    {
      key: "value",
      label: "Value",
      score: sub.value,
      rationale: rationales?.value?.[0],
    },
    {
      key: "momentum",
      label: "Momentum",
      score: sub.momentum,
      rationale: rationales?.momentum?.[0],
    },
    {
      key: "lowVol",
      label: "Risk",
      score: sub.lowVol,
      rationale: rationales?.lowVol?.[0],
    },
  ]
    .slice()
    .sort((a, b) => Math.abs(b.score - 50) - Math.abs(a.score - 50));
}

function gradeFromScore(score: number): string {
  if (score >= 75) return "sterk";
  if (score >= 60) return "bovengemiddeld";
  if (score >= 40) return "gemiddeld";
  if (score >= 25) return "zwak";
  return "zeer zwak";
}

function confidenceTier(value: number): ExplainConfidence {
  if (!Number.isFinite(value)) return "low";
  if (value >= 0.7) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}

function stanceLabel(stance: MarketRegimeStance): string {
  switch (stance) {
    case "RISK_ON":
      return "risk-on";
    case "DEFENSIVE":
      return "defensief";
    case "NEUTRAL":
    default:
      return "neutraal";
  }
}

function formatRecommendationLine(
  rec: AllocationRecommendation,
  baseCurrency: string,
): string {
  const amount = formatCurrency(rec.suggestedAmount, baseCurrency);
  const name = rec.name ?? rec.ticker;
  const action = rec.action === "buy" ? "nieuwe positie" : "bijkopen";
  const reason = rec.rationale[0];
  return reason ? `${name} · ${action} · ${amount} — ${reason}` : `${name} · ${action} · ${amount}`;
}

function computeBuyPlanConfidence(
  recs: AllocationRecommendation[],
): ExplainConfidence {
  if (recs.length === 0) return "low";
  const avgConviction =
    recs.reduce((sum, r) => sum + r.convictionScore, 0) / recs.length;
  if (avgConviction >= 0.6) return "high";
  if (avgConviction >= 0.4) return "medium";
  return "low";
}

function severityOrder(severity: RiskSeverity): number {
  const order: Record<RiskSeverity, number> = {
    low: 0,
    moderate: 2,
    elevated: 3,
    high: 4,
    critical: 5,
  };
  return order[severity];
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
