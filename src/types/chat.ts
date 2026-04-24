import type { ExplainConfidence, ExplainUseCase } from "./ai";
import type { Currency, ISODateString } from "./common";
import type { MarketRegimeStance } from "./regime";
import type { RiskSeverity } from "./risk";
import type { HealthGrade } from "./summary";

/**
 * Chat types. `ChatMessage` is serialiseerbaar zodat de client-state
 * zonder transformaties naar de API kan.
 */

export type ChatRole = "user" | "assistant" | "system";

export type ChatIntent =
  | ExplainUseCase
  | "welcome"
  | "fallback"
  | "context";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Optionele bullets voor structured responses. */
  bullets?: string[];
  /** Optionele korte headline boven het antwoord. */
  headline?: string;
  disclaimer?: string;
  confidence?: ExplainConfidence;
  intent?: ChatIntent;
  /** Referentie-velden uit engine-output die de assistent gebruikt heeft. */
  usedContextKeys?: string[];
  createdAt: ISODateString;
}

/**
 * Gecomprimeerde engine-snapshot die in context chips getoond wordt en
 * als basis dient voor fallback-responses.
 */
export interface ChatContext {
  portfolio: {
    id: string;
    name: string;
    baseCurrency: Currency;
    totalValue: number;
    positionCount: number;
    largestPosition?: { ticker: string; name: string; weight: number };
  };
  regime: {
    stance: MarketRegimeStance;
    score: number;
    confidence: number;
  } | null;
  risk: {
    severity: RiskSeverity;
    riskScore?: number;
    topFlags: Array<{ code: string; label: string }>;
  };
  health: {
    grade: HealthGrade;
    score: number;
    signals: number;
  };
  plan: {
    recommendations: number;
    deployed: number;
    cashReserved: number;
  };
  asOf: ISODateString;
}

export interface ChatRequestBody {
  message: string;
  history: ChatMessage[];
}

export interface ChatResponseBody {
  message: ChatMessage;
  context: ChatContext;
}
