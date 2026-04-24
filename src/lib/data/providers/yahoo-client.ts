import YahooFinance from "yahoo-finance2";

/**
 * Shared Yahoo Finance client singleton.
 *
 * yahoo-finance2 v3 vereist dat je de default-export instantieert
 * (`new YahooFinance()`). We maken hier één instance per Node-process
 * zodat de cookie-jar, rate-limit-logic en notice-suppression gedeeld
 * zijn tussen het provider-bestand en de symbol-resolver.
 *
 * De v3 types beschrijven een instance-object waar de lib intern zelf
 * wel een constructor op runtime biedt — cast om zowel strict-mode als
 * ESLint tevreden te houden zonder API-verliezen elders.
 */
interface YahooClientLike {
  quote: (...args: unknown[]) => Promise<unknown>;
  quoteSummary: (...args: unknown[]) => Promise<unknown>;
  chart: (...args: unknown[]) => Promise<unknown>;
  search: (...args: unknown[]) => Promise<unknown>;
  suppressNotices?: (keys: string[]) => void;
}

const YahooCtor = YahooFinance as unknown as new () => YahooClientLike;

export const yahooClient: YahooClientLike = new YahooCtor();

// suppressNotices hangt op de instance (runtime) maar zit niet in de
// publieke v3 types — optional chaining op een getypeerd veld is voldoende.
yahooClient.suppressNotices?.(["ripHistorical", "yahooSurvey"]);
