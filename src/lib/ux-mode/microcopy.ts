/**
 * Educatieve microcopy voor BEGINNER-mode.
 *
 * Per dashboard-sectie één korte, vriendelijke uitleg-zin in NL die de
 * gebruiker rustig in z'n eigen tempo door de UI loodst. Lynch-laag:
 * "geen jargon zonder uitleg".
 *
 * Voor FOCUS / EXPERT geeft `getMicrocopy(...)` een lege string terug —
 * UI checkt op truthy.
 */

import type { UxMode } from "@/types/profile";

export type MicrocopySection =
  | "primary_action"
  | "status_snapshot"
  | "health"
  | "goals"
  | "behavioral_coach"
  | "briefing"
  | "macro"
  | "confidence";

const BEGINNER_MICROCOPY: Record<MicrocopySection, string> = {
  primary_action:
    "Hier zie je de eerste actie die de engines voorstellen. Geen verplichting — neem de tijd om te begrijpen waarom.",
  status_snapshot:
    "Vijf snelle KPI's voor een eerste indruk: waarde, gezondheid, regime, vs benchmark, netto rendement.",
  health:
    "De Health Score (0–100) telt 10 dingen mee: spreiding, sectorconcentratie, volatiliteit, kwaliteit, waardering, en meer. Een score van 70+ is doorgaans gezond.",
  goals:
    "Je portefeuille bestaat niet voor zichzelf — koppel hem aan je leven: pensioen, FIRE, huis, of een eigen doel.",
  behavioral_coach:
    "We meten gedragspatronen (te veel handelen, FOMO, panic-verkopen). Geen verwijten — alleen reflectievragen.",
  briefing:
    "Eén keer per dag een korte memo over jouw portefeuille — bewegingen, risico's, één concrete focus.",
  macro:
    "Het macro-regime (Goldilocks / Reflation / Stagflation / Deflation) bepaalt welke beleggingscategorieën historisch rugwind krijgen.",
  confidence:
    "Per positie een 0–100 score over 10 signaalbronnen — kwaliteit, waardering, momentum, macro, fit. Klik door voor de volledige uitleg.",
};

export function getMicrocopy(
  section: MicrocopySection,
  mode: UxMode | null | undefined,
): string {
  if (mode !== "BEGINNER") return "";
  return BEGINNER_MICROCOPY[section] ?? "";
}
