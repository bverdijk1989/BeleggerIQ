import type { AllocationPlan } from "@/types/allocation";
import type { ChatContext, ChatMessage, ChatIntent } from "@/types/chat";
import type { MarketRegimeScore } from "@/types/regime";
import type { PortfolioView } from "@/lib/analytics/portfolio-view";
import type { HoldingValuation } from "@/lib/analytics/valuation";

import { explain } from "./explainers";

/**
 * Chat intent-routing + response builder. Volledig deterministisch:
 * berichten mappen naar één van de 5 explainers of een expliciete
 * fallback. Guardrails:
 *  - Geen engine-output = geen cijfers. Fallback legt dat uit.
 *  - Ranking blijft van de engine; chat-laag kiest alleen WELK onderdeel
 *    uitgelegd wordt.
 *  - Onbekende vragen leiden tot een "kan ik niet beantwoorden"-bericht
 *    met een lijst van wél ondersteunde vragen.
 */

interface IntentPattern {
  intent: ChatIntent;
  patterns: RegExp[];
}

// Volgorde is belangrijk: specifiekere matches staan boven algemene.
const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: "buy_plan",
    patterns: [
      /\b(koop|bij ?koop|bij ?kopen|maandplan|maandbeslissing|inleg|bijstort|aankoop)\b/i,
    ],
  },
  {
    intent: "fragile_concentration",
    patterns: [
      /\b(fragiel|gezond geconcentreerd|te groot|te zwaar|overweight|concentratie)\b/i,
    ],
  },
  {
    intent: "portfolio_risks",
    patterns: [/\b(risico'?s?|risks?|gevaar|zorgelijk|kwetsbaar|zwak punt)\b/i],
  },
  {
    intent: "market_regime",
    patterns: [
      /\b(regime|markt|marktstand|defensief|risk-on|risk.on|macro|monetair)\b/i,
    ],
  },
  {
    intent: "holding_score",
    patterns: [
      /\b(score|quality|value|momentum|factor|rating|kwaliteit)\b/i,
    ],
  },
];

export interface DetectedIntent {
  intent: ChatIntent;
  ticker: string | null;
}

export function detectIntent(message: string): DetectedIntent {
  const trimmed = message.trim();
  if (!trimmed) return { intent: "fallback", ticker: null };

  const ticker = extractTicker(trimmed);

  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const regex of patterns) {
      if (regex.test(trimmed)) {
        return { intent, ticker };
      }
    }
  }
  return { intent: "fallback", ticker };
}

function extractTicker(text: string): string | null {
  // Matcht klassieke tickers: 2-5 hoofdletters + optionele suffix (.AS, .DE, ...).
  const match = text.match(/\b([A-Z]{1,5}(?:\.[A-Z]{1,3})?)\b/);
  return match?.[1] ?? null;
}

// ============================================================
//  Response builder
// ============================================================

export interface BuildResponseInput {
  message: string;
  view: PortfolioView;
  plan: AllocationPlan;
  regime: MarketRegimeScore | null;
  ctx: ChatContext;
}

export function buildAssistantResponse(
  input: BuildResponseInput,
): ChatMessage {
  const detected = detectIntent(input.message);

  switch (detected.intent) {
    case "buy_plan":
      return fromExplain(
        explain({
          useCase: "buy_plan",
          plan: input.plan,
          regime: input.regime,
        }),
        "buy_plan",
      );

    case "portfolio_risks":
      return fromExplain(
        explain({
          useCase: "portfolio_risks",
          risk: input.view.risk,
          baseCurrency: input.ctx.portfolio.baseCurrency,
        }),
        "portfolio_risks",
      );

    case "market_regime":
      if (!input.regime) {
        return fallback(
          "Marktregime",
          "Ik heb op dit moment geen actuele marktsnapshot in de database om een regime-uitleg te geven.",
        );
      }
      return fromExplain(
        explain({ useCase: "market_regime", regime: input.regime }),
        "market_regime",
      );

    case "fragile_concentration": {
      const target = findHoldingValuation(
        input.view,
        detected.ticker,
      );
      if (!target) {
        return fallback(
          "Concentratie",
          "Ik vond geen positie om de concentratie van uit te leggen. Noem een ticker uit je portefeuille, bv. ASML of MSFT.",
        );
      }
      const { concentrationType, fragilityScore, reasons, maxPositionWeight } =
        resolveConcentration(target, input.view);
      return fromExplain(
        explain({
          useCase: "fragile_concentration",
          ticker: target.holding.ticker,
          name: target.holding.name,
          positionWeight:
            input.ctx.portfolio.totalValue > 0
              ? target.marketValueBase / input.ctx.portfolio.totalValue
              : 0,
          concentrationType,
          fragilityScore,
          reasons,
          maxPositionWeight,
        }),
        "fragile_concentration",
      );
    }

    case "holding_score": {
      const target = findHoldingValuation(input.view, detected.ticker);
      if (!target || !target.holding.factorScore) {
        return fallback(
          "Factor score",
          "Ik heb geen factor-score voor die positie. Vraag naar een ticker die in je portefeuille zit en gescoord is (bv. ASML).",
        );
      }
      return fromExplain(
        explain({
          useCase: "holding_score",
          ticker: target.holding.ticker,
          name: target.holding.name,
          sector: target.holding.sector,
          factorScore: target.holding.factorScore,
        }),
        "holding_score",
      );
    }

    case "welcome":
    case "context":
    case "fallback":
    default:
      return buildFallbackMessage();
  }
}

// ============================================================
//  Welcome + fallback
// ============================================================

export function buildWelcomeMessage(ctx: ChatContext): ChatMessage {
  const bullets = [
    `Portefeuille: ${formatCurrency(ctx.portfolio.totalValue, ctx.portfolio.baseCurrency)} · ${ctx.portfolio.positionCount} posities.`,
    `Health ${ctx.health.grade} (${ctx.health.score}/100); risico ${ctx.risk.severity}.`,
    ctx.regime
      ? `Marktregime: ${ctx.regime.stance} (${ctx.regime.score}/100).`
      : "Marktregime: geen recente data.",
    `Maandplan: ${ctx.plan.recommendations} recommendations voor ${formatCurrency(ctx.plan.deployed, ctx.portfolio.baseCurrency)}.`,
  ];

  return {
    id: `welcome-${Date.now()}`,
    role: "assistant",
    intent: "welcome",
    headline: "Welkom terug",
    content:
      "Ik beantwoord vragen op basis van je portfolio, factor-scores, risico-engine, marktregime en maandplan. Geen stock tips buiten deze engines om.",
    bullets,
    createdAt: new Date().toISOString(),
  };
}

function buildFallbackMessage(): ChatMessage {
  return {
    id: `fallback-${Date.now()}`,
    role: "assistant",
    intent: "fallback",
    headline: "Daar kan ik geen onderbouwd antwoord op geven",
    content:
      "Mijn antwoorden komen rechtstreeks uit de analytics-engines. Ik kan je helpen met onder andere:",
    bullets: [
      "Wat moet ik deze maand bijkopen? (maandplan)",
      "Waar zit mijn grootste risico? (risk engine)",
      "Welke positie is te groot of fragiel? (concentratie-analyse)",
      "Hoe defensief is de markt nu? (marktregime)",
      "Wat is de factor-score van <ticker>?",
    ],
    disclaimer:
      "Als je ticker noemt (bv. ASML) pak ik die specifieke positie.",
    createdAt: new Date().toISOString(),
  };
}

function fallback(headline: string, content: string): ChatMessage {
  return {
    id: `fallback-${Date.now()}`,
    role: "assistant",
    intent: "fallback",
    headline,
    content,
    createdAt: new Date().toISOString(),
  };
}

// ============================================================
//  Helpers
// ============================================================

function fromExplain(
  response: ReturnType<typeof explain>,
  intent: ChatIntent,
): ChatMessage {
  return {
    id: `${intent}-${Date.now()}`,
    role: "assistant",
    intent,
    headline: response.headline,
    content: response.narrative,
    bullets: response.bullets,
    confidence: response.confidence,
    disclaimer: response.disclaimer,
    usedContextKeys: response.usedContextKeys,
    createdAt: new Date().toISOString(),
  };
}

function findHoldingValuation(
  view: PortfolioView,
  ticker: string | null,
): HoldingValuation | null {
  if (!ticker) {
    // Geen ticker → pak de grootste positie.
    return view.valuations
      .slice()
      .sort((a, b) => b.marketValueBase - a.marketValueBase)[0] ?? null;
  }
  const upper = ticker.toUpperCase();
  return (
    view.valuations.find(
      (v) => v.holding.ticker.toUpperCase() === upper,
    ) ?? null
  );
}

/**
 * Haalt concentratie-classificatie uit de rebalance-engine output.
 * Valt terug op defaults als er geen recommendation voor de ticker is.
 */
function resolveConcentration(
  valuation: HoldingValuation,
  view: PortfolioView,
): {
  concentrationType: "HEALTHY" | "NEUTRAL" | "FRAGILE";
  fragilityScore: number;
  reasons: string[];
  maxPositionWeight: number;
} {
  const rec = view.rebalance.recommendations.find(
    (r) => r.ticker === valuation.holding.ticker,
  );
  if (rec) {
    return {
      concentrationType: rec.concentrationType,
      fragilityScore: rec.fragilityScore,
      reasons: rec.reasons,
      maxPositionWeight: 0.1, // policy default; engine gebruikt intern zijn eigen cap
    };
  }
  return {
    concentrationType: "NEUTRAL",
    fragilityScore: 40,
    reasons: [
      "Geen rebalance-output beschikbaar — neutrale inschatting op basis van gewicht.",
    ],
    maxPositionWeight: 0.1,
  };
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
