import type {
  BuyPlanContext,
  ExplainContext,
  FragileConcentrationContext,
  HoldingScoreContext,
  MarketRegimeContext,
  PortfolioRisksContext,
} from "@/types/ai";

/**
 * Prompt-builders voor de AI explain layer.
 *
 * De system prompt stelt de guardrails vast. Elke use case heeft een
 * `buildUserPrompt` die de engine-output als gestructureerde JSON inlegt,
 * zodat een LLM geen ruimte heeft om cijfers te verzinnen.
 *
 * De deterministische explainers (zie `./explainers.ts`) gebruiken de
 * prompts niet; ze zijn voorbereid zodat een LLM-upgrade straks enkel
 * de `LlmClient` hoeft te swappen.
 */

export interface PromptPayload {
  system: string;
  user: string;
}

export const EXPLAIN_SYSTEM_PROMPT = [
  "Je bent een BeleggerIQ-analist. Je enige taak is analytics-engine outputs vertalen naar begrijpelijke Nederlandstalige uitleg.",
  "",
  "Strikte regels:",
  "1. Gebruik UITSLUITEND cijfers en feiten die in de `CONTEXT` hieronder staan.",
  "2. Verzin geen nieuwe scores, bedragen, tickers of percentages.",
  "3. Je mag de rangorde of classificatie uit de engine NIET overschrijven — leg uit wat er staat.",
  "4. Als `confidence` of `coverage` laag is, benoem dat expliciet.",
  "5. Schrijf zakelijk, rustig en compact. Geen disclaimers als verkooppraatje; dit is analyse, geen advies.",
  "6. Output-formaat: eerst één `headline` zin, dan een paragraaf van maximaal 4 zinnen, optioneel bullets met 1-2 zinnen elk.",
  "7. Geen marketing-taal, geen superlatieven. Blijf feitelijk.",
].join("\n");

export function buildExplainPrompt(
  context: ExplainContext,
): PromptPayload {
  switch (context.useCase) {
    case "holding_score":
      return {
        system: EXPLAIN_SYSTEM_PROMPT,
        user: buildHoldingScorePrompt(context),
      };
    case "fragile_concentration":
      return {
        system: EXPLAIN_SYSTEM_PROMPT,
        user: buildFragileConcentrationPrompt(context),
      };
    case "buy_plan":
      return {
        system: EXPLAIN_SYSTEM_PROMPT,
        user: buildBuyPlanPrompt(context),
      };
    case "market_regime":
      return {
        system: EXPLAIN_SYSTEM_PROMPT,
        user: buildMarketRegimePrompt(context),
      };
    case "portfolio_risks":
      return {
        system: EXPLAIN_SYSTEM_PROMPT,
        user: buildPortfolioRisksPrompt(context),
      };
  }
}

// ============================================================
//  Use-case prompts
// ============================================================

function buildHoldingScorePrompt(ctx: HoldingScoreContext): string {
  const fs = ctx.factorScore;
  return [
    "Use case: uitleg waarom deze holding deze factor-score heeft.",
    "",
    "CONTEXT:",
    jsonBlock({
      ticker: ctx.ticker,
      name: ctx.name,
      sector: ctx.sector,
      composite: fs.composite,
      subScores: fs.subScores,
      rationales: fs.rationales,
      confidence: fs.confidence,
      model: fs.model,
    }),
    "",
    "Schrijf:",
    "- Headline: naam + composite score + kwalificatie.",
    "- Paragraaf: waarom de score zo hoog/laag is, op basis van sub-scores en rationales.",
    "- Bullets: top-2 sterke en top-1 zwakke drivers.",
    "Benoem explicit als confidence laag is (< 0.5).",
  ].join("\n");
}

function buildFragileConcentrationPrompt(
  ctx: FragileConcentrationContext,
): string {
  return [
    "Use case: uitleg waarom een positie als FRAGILE/NEUTRAL/HEALTHY is geclassificeerd.",
    "",
    "CONTEXT:",
    jsonBlock({
      ticker: ctx.ticker,
      name: ctx.name,
      positionWeight: ctx.positionWeight,
      policyCap: ctx.maxPositionWeight,
      concentrationType: ctx.concentrationType,
      fragilityScore: ctx.fragilityScore,
      reasons: ctx.reasons,
    }),
    "",
    "Schrijf:",
    "- Headline: naam + classificatie.",
    "- Paragraaf: benoem gewicht vs policy-cap, fragility-score en de sterkste reasons.",
    "- Bullets: elk één reason uit de lijst.",
    "Benoem dat HEALTHY winners niet automatisch verkocht worden.",
  ].join("\n");
}

function buildBuyPlanPrompt(ctx: BuyPlanContext): string {
  const plan = ctx.plan;
  const recsSummary = plan.recommendations.slice(0, 5).map((r) => ({
    ticker: r.ticker,
    name: r.name,
    action: r.action,
    amount: r.suggestedAmount,
    currentWeight: r.currentWeight,
    targetWeight: r.targetWeight,
    composite: r.factorScore?.composite ?? null,
    priority: r.priority ?? null,
    topReason: r.rationale[0] ?? null,
  }));
  return [
    "Use case: uitleg waarom het maandplan deze posities aankoopt.",
    "",
    "CONTEXT:",
    jsonBlock({
      portfolioId: plan.portfolioId,
      baseCurrency: plan.baseCurrency,
      budget: plan.budget,
      deployedAmount: plan.deployedAmount,
      cashReserved: plan.cashReserved,
      monthlyContribution: plan.monthlyContribution,
      coreEtfUsed: plan.coreEtfUsed,
      warnings: plan.warnings,
      regime: ctx.regime
        ? {
            stance: ctx.regime.stance,
            score: ctx.regime.score,
            confidence: ctx.regime.confidence,
          }
        : null,
      recommendations: recsSummary,
    }),
    "",
    "Schrijf:",
    "- Headline: aantal aanbevelingen + totaal bedrag.",
    "- Paragraaf: benoem de regime-stance, welke factor de top-rank domineert, eventuele warnings.",
    "- Bullets per aanbeveling: ticker, actie, bedrag, topReason.",
    "Als deployedAmount < budget, leg uit waarom cash wordt aangehouden.",
  ].join("\n");
}

function buildMarketRegimePrompt(ctx: MarketRegimeContext): string {
  const r = ctx.regime;
  return [
    "Use case: uitleg van het huidige marktregime.",
    "",
    "CONTEXT:",
    jsonBlock({
      stance: r.stance,
      score: r.score,
      confidence: r.confidence,
      narrative: r.narrative,
      subDrivers: r.subDrivers.map((d) => ({
        key: d.key,
        label: d.label,
        score: d.score,
        rationale: d.rationale,
      })),
    }),
    "",
    "Schrijf:",
    "- Headline: stance + score.",
    "- Paragraaf: welke drivers trekken de score omhoog, welke drukken, en wat betekent dit voor allocatiebias.",
    "- Bullets: de 2-3 meest uitgesproken drivers uit subDrivers.",
    "Zeg expliciet als confidence < 50% is.",
  ].join("\n");
}

function buildPortfolioRisksPrompt(ctx: PortfolioRisksContext): string {
  const r = ctx.risk;
  return [
    "Use case: samenvatting van de drie belangrijkste risico's in de portefeuille.",
    "",
    "CONTEXT:",
    jsonBlock({
      overallSeverity: r.overallSeverity,
      riskScore: r.riskScore,
      largestPositionWeight: r.largestPositionWeight,
      top5Weight: r.top5Weight,
      concentrationHhi: r.concentrationHhi,
      foreignCurrencyExposure: r.foreignCurrencyExposure,
      topSector: r.topSector,
      baseCurrency: ctx.baseCurrency,
      flags: r.flags.slice(0, 6).map((f) => ({
        code: f.code,
        severity: f.severity,
        label: f.label,
        message: f.message,
      })),
    }),
    "",
    "Schrijf:",
    "- Headline: overall severity + riskScore.",
    "- Paragraaf: benoem concrete concentratie-/valuta-/sectorrisico's uit de flags.",
    "- Bullets: top-3 flags (code + message).",
    "Vermijd alarmerende taal; het is analytisch gereedschap.",
  ].join("\n");
}

// ============================================================
//  Internals
// ============================================================

function jsonBlock(value: unknown): string {
  return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
}
