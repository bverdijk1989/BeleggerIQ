import { scoreFactors } from "@/lib/analytics/factors/composite";
import { getFundamentals } from "@/lib/data/fundamentals";
import { getHistory } from "@/lib/data/history";
import { portfolioRepository } from "@/lib/data";
import type { FactorScore } from "@/types/factor";
import type { Holding } from "@/types/portfolio";

import {
  buildResearchContext,
  renderResearchDossier,
  type ResearchDossier,
} from "./research-dossier";

/**
 * Server-only loader voor de research-dossier API. Verzamelt:
 *   - holding (uit portefeuille, via email)
 *   - fundamentals (cache → provider)
 *   - 400d daily history → factor-score
 *   - mispricing/opportunity stay optional (caller may inject later)
 *
 * Pure I/O + transformatie. Faal-safe: ontbrekende inputs → context met
 * minder data, niet een crash.
 */

export interface LoadResearchDossierInput {
  userEmail: string;
  ticker: string;
}

export interface LoadResearchDossierResult {
  dossier: ResearchDossier;
  diagnostics: {
    foundHolding: boolean;
    fundamentalsAvailable: boolean;
    factorScored: boolean;
    historyDays: number;
  };
}

const HISTORY_LOOKBACK_DAYS = 400;

export async function loadResearchDossier(
  input: LoadResearchDossierInput,
): Promise<LoadResearchDossierResult> {
  const ticker = input.ticker.trim().toUpperCase();
  if (!ticker) throw new Error("ticker is verplicht");

  const portfolio = await portfolioRepository
    .findPrimaryByEmail(input.userEmail)
    .catch(() => null);
  const holding =
    portfolio?.holdings.find(
      (h) => h.ticker.toUpperCase() === ticker,
    ) ?? null;

  // History + fundamentals parallel.
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - HISTORY_LOOKBACK_DAYS);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);

  const [fundamentals, history] = await Promise.all([
    getFundamentals(ticker).catch(() => null),
    getHistory({
      ticker,
      startDate: startIso,
      endDate: endIso,
      interval: "1d",
    }).catch(() => []),
  ]);

  // Score factors wanneer er ten minste fundamentals óf history is.
  let factorScore: FactorScore | null = null;
  if (fundamentals !== null || history.length > 0) {
    factorScore = scoreFactors({
      ticker,
      asOf: new Date().toISOString(),
      fundamentals,
      priceHistory: history,
    });
  }

  const context = buildResearchContext({
    ticker,
    name: holding?.name ?? null,
    factorScore,
    fundamentals,
    holding: holding ?? null,
  });
  const dossier = renderResearchDossier(context);

  return {
    dossier,
    diagnostics: {
      foundHolding: holding !== null,
      fundamentalsAvailable: fundamentals !== null,
      factorScored: factorScore !== null,
      historyDays: history.length,
    },
  };
}

// Re-export types from research-dossier for convenience.
export type { ResearchDossier } from "./research-dossier";

// Helpers for tests
export function _findHoldingByTicker(
  holdings: Holding[],
  ticker: string,
): Holding | null {
  const upper = ticker.trim().toUpperCase();
  return holdings.find((h) => h.ticker.toUpperCase() === upper) ?? null;
}
