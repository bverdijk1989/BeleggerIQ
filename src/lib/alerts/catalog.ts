/**
 * Alert-catalog — bron van waarheid voor de 10 alert-typen.
 *
 * **Default opt-in**: nieuwe gebruikers krijgen alle alert-typen aan,
 * zodat ze niet stilzwijgend belangrijke signalen missen. Ze kunnen
 * altijd uitzetten in de preferences (M30 alerts-tab).
 *
 * **Default severity**: per-type natuurlijke severity. Generators kunnen
 * 'em verhogen (bv. -8% dag → CRITICAL i.p.v. WARNING).
 */

import type { AlertCategory, AlertType, AlertTypeDefinition } from "./types";

export const ALERT_CATALOG: ReadonlyArray<AlertTypeDefinition> = [
  {
    type: "HEALTH_DROP",
    label: "Health Score daalt",
    description:
      "Je Portfolio Health Score zakt onder een drempel of valt naar een lagere grade.",
    defaultSeverity: "WARNING",
    defaultEnabled: true,
    category: "portfolio",
  },
  {
    type: "CONCENTRATION_RISING",
    label: "Concentratie neemt toe",
    description:
      "Een positie of sector groeit boven je policy-cap of een natuurlijke veiligheidsdrempel.",
    defaultSeverity: "WARNING",
    defaultEnabled: true,
    category: "risk",
  },
  {
    type: "PRICE_MOVE",
    label: "Grote koersbeweging",
    description:
      "Een positie in je portefeuille beweegt meer dan ±5% op één dag.",
    defaultSeverity: "INFO",
    defaultEnabled: true,
    category: "market",
  },
  {
    type: "MACRO_REGIME_CHANGE",
    label: "Macroregime wijzigt",
    description:
      "Het macroregime schakelt (Goldilocks/Reflation/Stagflation/Deflation).",
    defaultSeverity: "WARNING",
    defaultEnabled: true,
    category: "market",
  },
  {
    type: "BEHAVIORAL_WARNING",
    label: "Gedragswaarschuwing",
    description:
      "De Behavioral Coach detecteert een nieuw patroon (overtrading, panic, FOMO, drift).",
    defaultSeverity: "WARNING",
    defaultEnabled: true,
    category: "behavioral",
  },
  {
    type: "EARNINGS_EVENT",
    label: "Earnings event",
    description:
      "Een positie publiceert binnenkort kwartaalcijfers (vereist earnings-feed).",
    defaultSeverity: "INFO",
    defaultEnabled: true,
    category: "events",
  },
  {
    type: "DIVIDEND_EVENT",
    label: "Dividend event",
    description:
      "Een ex-dividend datum nadert of er wordt een dividend uitgekeerd.",
    defaultSeverity: "INFO",
    defaultEnabled: true,
    category: "events",
  },
  {
    type: "WATCHLIST_OPPORTUNITY",
    label: "Watchlist-koopzone",
    description:
      "Een watchlist-item komt in de gewenste prijs- of waarderings-zone.",
    defaultSeverity: "INFO",
    defaultEnabled: true,
    category: "events",
  },
  {
    type: "VALUATION_SIGNAL",
    label: "Waarderingssignaal",
    description:
      "Een positie nadert een aantrekkelijke value-multiple (P/E onder mediaan, FCF-yield boven drempel).",
    defaultSeverity: "INFO",
    defaultEnabled: true,
    category: "market",
  },
  {
    type: "DATA_QUALITY_LOW",
    label: "Lage datakwaliteit",
    description:
      "Eén of meer engines (Portfolio Health, Confidence-score) leunen op onvoldoende data — interpreteer de scores met onzekerheidsmarge.",
    defaultSeverity: "INFO",
    defaultEnabled: true,
    category: "portfolio",
  },
  {
    type: "AI_BRIEFING_READY",
    label: "AI dagelijkse briefing",
    description:
      "Je dagelijkse AI Briefing is klaar — kort, persoonlijk, met focuspunt.",
    defaultSeverity: "INFO",
    defaultEnabled: true,
    category: "ai",
  },
];

export const ALERT_CATEGORY_LABELS: Record<AlertCategory, string> = {
  portfolio: "Portefeuille",
  risk: "Risico",
  market: "Markt & koersen",
  behavioral: "Gedrag",
  events: "Events",
  ai: "AI",
};

const BY_TYPE: Map<AlertType, AlertTypeDefinition> = new Map(
  ALERT_CATALOG.map((c) => [c.type, c]),
);

export function getAlertTypeDefinition(type: AlertType): AlertTypeDefinition {
  const def = BY_TYPE.get(type);
  if (!def) throw new Error(`Unknown alert type: ${type}`);
  return def;
}
