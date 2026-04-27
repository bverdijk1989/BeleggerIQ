import type { ISODateString } from "@/types/common";
import type {
  ActionDecision,
  ActionUrgency,
  PositionAction,
} from "@/lib/analytics/actions";
import type { FactorScore } from "@/types/factor";
import type { PositionRiskAnalysis } from "@/types/risk";

/**
 * AI Decision Explainer — types.
 *
 * Doel: AI legt uit **wat de engine al heeft besloten**, niet wat de
 * engine moet doen. AI mag geen nieuwe cijfers, scores of acties
 * verzinnen.
 *
 * Architectuur:
 *  - **Pure renderer**: deterministische template-functies bouwen
 *    NL-zinnen rond de getallen die in `PositionAction` zitten. Geen
 *    LLM-call.
 *  - **Prompt-payload**: voor een toekomstige LLM-swap is er een
 *    `buildActionDecisionPrompt` die exact dezelfde context als JSON
 *    doorgeeft met strikte system-prompt-regels.
 *  - **Validator**: `validateExplanationAgainstAction` checkt of een
 *    (theoretisch) AI-gegenereerde tekst geen cijfers bevat die niet
 *    in de actie-input voorkomen — guardrail tegen hallucinatie.
 */

export interface ActionDecisionExplanationInput {
  action: PositionAction;
  /** Optioneel — gebruikt om quality/value-context te benoemen. */
  factorScore?: FactorScore | null;
  /** Optioneel — gebruikt om risk-class te citeren. */
  positionRisk?: PositionRiskAnalysis | null;
  /** Override `now` voor deterministische tests. */
  now?: string;
}

export interface ActionDecisionExplanation {
  generatedAt: ISODateString;
  action: ActionDecision;
  urgency: ActionUrgency;
  symbol: string;
  /** Eén-zin-samenvatting (NL). */
  headline: string;
  /** "Waarom logisch" — bullets. Komen uit engine-rationale. */
  whyLogical: string[];
  /** "Risico's" — wat is het risico van deze actie. */
  risks: string[];
  /** "Wat kan misgaan" — concrete failure-modes per actie-type. */
  whatCanGoWrong: string[];
  /** Engine-bronnen die hebben bijgedragen (factor / risk / rebalance / policy / regime). */
  sources: PositionAction["sources"];
  /** 0..1 — overgenomen uit `action.confidence`, daalt bij missing context. */
  confidence: number;
  /** Klein bericht onderaan met de juridische / data-onzekerheid. */
  disclaimer: string;
}
