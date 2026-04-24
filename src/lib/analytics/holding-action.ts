/**
 * Holding action derivation.
 *
 * Leidt een aanbevolen actie (BUY CANDIDATE / HOLD / WATCH / TRIM / AVOID) af
 * uit een composite factor score, coverage en positiegewicht t.o.v. het
 * target. Puur — geen I/O — zodat UI de uitkomst alleen maar weergeeft.
 *
 * Drempels zijn bewust conservatief: een BUY-signaal vereist composite ≥ 75
 * én voldoende datacoverage, zodat "onvolledige data" nooit onbedoeld een
 * koopadvies triggert.
 */

export type HoldingAction =
  | "BUY_CANDIDATE"
  | "HOLD"
  | "WATCH"
  | "TRIM"
  | "AVOID";

export interface HoldingActionResult {
  action: HoldingAction;
  rationale: string;
  confidence: number;
}

export interface DeriveHoldingActionInput {
  /** Composite factor score, 0..100. Undefined = nog geen score. */
  composite?: number | null;
  /** 0..1, coverage van beschikbare factor-signalen. */
  confidence?: number | null;
  /** Huidig gewicht van de positie in de portefeuille, 0..1. */
  currentWeight?: number | null;
  /** Beleidsmatig target, 0..1. Als afwezig → geen TRIM op basis van gewicht. */
  targetWeight?: number | null;
}

export const ACTION_LABELS: Record<HoldingAction, string> = {
  BUY_CANDIDATE: "BUY CANDIDATE",
  HOLD: "HOLD",
  WATCH: "WATCH",
  TRIM: "TRIM",
  AVOID: "AVOID",
};

export const ACTION_DESCRIPTIONS: Record<HoldingAction, string> = {
  BUY_CANDIDATE:
    "Score en coverage zijn sterk — positie komt in aanmerking voor bijkopen.",
  HOLD: "Score bevestigt het huidige belegger-profiel; positie behouden.",
  WATCH:
    "Onvoldoende data of een neutrale score — monitor vóór je bijkoopt of verkoopt.",
  TRIM: "Zwak profiel en positie boven target-gewicht — overweeg afbouwen.",
  AVOID: "Duidelijk ondergemiddelde score — verkoop overwegen.",
};

// Drempelwaarden — geëxporteerd voor tests en voor UI-legend consistentie.
export const ACTION_THRESHOLDS = {
  buyMin: 75,
  avoidMax: 35,
  trimMax: 50,
  holdMin: 60,
  minConfidence: 0.3,
  /** Overweight multiplier op targetWeight waaronder TRIM niet triggert. */
  trimOverweightMultiplier: 1.1,
} as const;

export function deriveHoldingAction(
  input: DeriveHoldingActionInput,
): HoldingActionResult {
  const composite =
    typeof input.composite === "number" && Number.isFinite(input.composite)
      ? input.composite
      : null;
  const confidence =
    typeof input.confidence === "number" && Number.isFinite(input.confidence)
      ? input.confidence
      : 0;

  if (composite === null) {
    return {
      action: "WATCH",
      rationale: "Nog geen factor score beschikbaar.",
      confidence: 0,
    };
  }

  if (confidence < ACTION_THRESHOLDS.minConfidence) {
    return {
      action: "WATCH",
      rationale: `Beperkte datacoverage (${Math.round(confidence * 100)}%) — score is onbetrouwbaar.`,
      confidence,
    };
  }

  if (composite >= ACTION_THRESHOLDS.buyMin) {
    return {
      action: "BUY_CANDIDATE",
      rationale: `Sterke composite score (${Math.round(composite)}/100) met voldoende coverage.`,
      confidence,
    };
  }

  if (composite <= ACTION_THRESHOLDS.avoidMax) {
    return {
      action: "AVOID",
      rationale: `Zwakke composite score (${Math.round(composite)}/100) — profiel ondermaats.`,
      confidence,
    };
  }

  if (composite < ACTION_THRESHOLDS.trimMax && isOverweight(input)) {
    return {
      action: "TRIM",
      rationale: `Matige score (${Math.round(composite)}/100) en positie boven target-gewicht.`,
      confidence,
    };
  }

  if (composite >= ACTION_THRESHOLDS.holdMin) {
    return {
      action: "HOLD",
      rationale: `Bovengemiddelde score (${Math.round(composite)}/100).`,
      confidence,
    };
  }

  return {
    action: "HOLD",
    rationale: `Gemiddelde score (${Math.round(composite)}/100) — geen acute actie.`,
    confidence,
  };
}

function isOverweight(input: DeriveHoldingActionInput): boolean {
  const current = input.currentWeight;
  const target = input.targetWeight;
  if (
    typeof current !== "number" ||
    typeof target !== "number" ||
    !Number.isFinite(current) ||
    !Number.isFinite(target) ||
    target <= 0
  ) {
    return false;
  }
  return current > target * ACTION_THRESHOLDS.trimOverweightMultiplier;
}
