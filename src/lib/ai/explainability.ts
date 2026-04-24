/**
 * AI explainability – placeholder.
 *
 * Doel: elke beslissing die de app toont (koopadvies, rebalance, risk alert)
 * moet reconstrueerbaar zijn. Deze module bundelt inputs, beslissingsregel en
 * uitkomst in een gestructureerde trace die in de UI getoond kan worden.
 */

export interface DecisionTrace {
  id: string;
  createdAt: string;
  summary: string;
  inputs: Record<string, unknown>;
  reasoning: string[];
  outputs: Record<string, unknown>;
  model?: string;
}

export function createTrace(init: Omit<DecisionTrace, "id" | "createdAt">): DecisionTrace {
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...init,
  };
}
