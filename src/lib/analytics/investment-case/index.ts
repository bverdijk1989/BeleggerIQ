/**
 * Stock Story & Investment Case Layer — public API (Module 31).
 */

export {
  buildInvestmentCase,
  type BuildInvestmentCaseInput,
} from "./engine";
export {
  buildInvestmentCasePrompt,
  type InvestmentCasePromptPayload,
} from "./ai-prompt";
export {
  loadInvestmentCase,
  type LoadInvestmentCaseInput,
} from "./loader";
export {
  CARD_LABELS,
  CARD_ORDER,
  INVESTMENT_CASE_DISCLAIMER,
  type InvestmentCase,
  type InvestmentCaseAssetKind,
  type InvestmentCaseCard,
  type InvestmentCaseCardKey,
} from "./types";
