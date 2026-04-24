import type { InstrumentClassification } from "@/lib/analytics/instruments";
import type { Holding } from "@/types/portfolio";

import type { InstrumentRiskLevel } from "./types";

/**
 * Bepaalt het risico-profiel van een instrument voor policy-doeleinden.
 *
 * Beslissingsvolgorde (pure regels, geen overlap):
 *   1. Leveraged/inverse → HIGH (altijd, ongeacht data)
 *   2. Crypto → HIGH
 *   3. `isSpeculative` (uit classifier, bv. theme-ETF) → HIGH
 *   4. Expliciete high volatility (≥ 0.40 jaarlijks) → HIGH
 *   5. Expliciete elevated volatility (0.30–0.40) → ELEVATED
 *   6. `isBroadMarket` + bond/cash → LOW
 *   7. Single stock met sterke factor-coverage → MODERATE (default)
 *   8. Onbekend instrument → ELEVATED (we weten het niet zeker)
 *
 * Elke tak voegt een `rationale`-regel toe zodat de UI toont waarom.
 */

export interface ClassifyInstrumentRiskInput {
  holding: Pick<Holding, "volatility">;
  classification: InstrumentClassification;
}

export interface InstrumentRiskAssessment {
  level: InstrumentRiskLevel;
  rationale: string[];
}

export function classifyInstrumentRisk(
  input: ClassifyInstrumentRiskInput,
): InstrumentRiskAssessment {
  const { holding, classification } = input;
  const { instrumentType, metadata } = classification;
  const vol =
    typeof holding.volatility === "number" && Number.isFinite(holding.volatility)
      ? holding.volatility
      : null;

  const rationale: string[] = [];

  // 1) Leveraged / inverse — structureel speculatief.
  if (instrumentType === "LEVERAGED_OR_INVERSE") {
    return {
      level: "HIGH",
      rationale: ["Leveraged of inverse product — compounding-drift + speculatief."],
    };
  }

  // 2) Crypto — standalone asset class met eigen volatility-regime.
  if (instrumentType === "CRYPTO") {
    return {
      level: "HIGH",
      rationale: ["Cryptocurrency — structureel hoog volatiel."],
    };
  }

  // 3) Classifier-gedetecteerde speculatieve posities (bv. theme-ETF).
  if (metadata.isSpeculative) {
    rationale.push("Speculatief volgens classifier (narrow exposure / themagedreven).");
    return { level: "HIGH", rationale };
  }

  // 4–5) Expliciete volatility overschrijft heuristiek wanneer bekend.
  if (vol !== null) {
    if (vol >= 0.4) {
      return {
        level: "HIGH",
        rationale: [`Geannualiseerde volatility ${(vol * 100).toFixed(1)}% — hoog.`],
      };
    }
    if (vol >= 0.3) {
      return {
        level: "ELEVATED",
        rationale: [
          `Geannualiseerde volatility ${(vol * 100).toFixed(1)}% — bovengemiddeld.`,
        ],
      };
    }
  }

  // 6) Defensieve classificaties.
  if (instrumentType === "CASH") {
    return { level: "LOW", rationale: ["Cash-equivalent — geen koersgevoeligheid."] };
  }
  if (instrumentType === "BOND_ETF") {
    return {
      level: "LOW",
      rationale: ["Bond / vastrentend — structureel lager risico dan equity."],
    };
  }
  if (metadata.isBroadMarket) {
    rationale.push("Breed gespreid index-instrument.");
    if (vol !== null) rationale.push(`Volatility ${(vol * 100).toFixed(1)}%.`);
    return { level: "LOW", rationale };
  }

  // 7) Single stock met known data — MODERATE als default voor EQUITY.
  if (instrumentType === "SINGLE_STOCK") {
    rationale.push("Individueel aandeel — standaard moderate risico-profiel.");
    if (vol !== null) rationale.push(`Volatility ${(vol * 100).toFixed(1)}%.`);
    return { level: "MODERATE", rationale };
  }

  // Sector / factor / theme / commodity / income → MODERATE als baseline,
  // met sector-ETF als mild-elevated door concentration.
  if (instrumentType === "SECTOR_ETF" || instrumentType === "COMMODITY_ETF") {
    return {
      level: "ELEVATED",
      rationale: [
        `${instrumentType === "SECTOR_ETF" ? "Sector" : "Commodity"}-concentratie verhoogt profiel.`,
      ],
    };
  }

  if (instrumentType === "THEME_ETF") {
    return {
      level: "HIGH",
      rationale: ["Themagedreven ETF — narratief-risico."],
    };
  }

  if (instrumentType === "INCOME_ETF") {
    return {
      level: "MODERATE",
      rationale: [
        "Income-ETF — gemiddeld profiel; capped upside maar bekende cashflows.",
      ],
    };
  }

  if (instrumentType === "FACTOR_ETF") {
    return {
      level: "MODERATE",
      rationale: ["Factor-ETF — breed maar met tilt."],
    };
  }

  // 8) Alles wat we niet kennen krijgt ELEVATED als veiligheidsbuffer.
  return {
    level: "ELEVATED",
    rationale: [
      "Instrument-type onbekend of niet-gekwalificeerd — veilig aan de bovenkant.",
    ],
  };
}
