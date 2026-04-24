import type { EnrichedInstrument } from "@/lib/data/instrument-enrichment";
import type { AssetClass, Holding } from "@/types/portfolio";

import { classifyEtfByName } from "./etf-lookthrough";
import {
  defaultMetadata,
  type ClassificationConfidence,
  type InstrumentClassification,
  type InstrumentMetadata,
  type InstrumentType,
} from "./types";

/**
 * Instrument classifier — pure. Zelfde input → zelfde output, geen I/O.
 *
 * Signatuur: `classifyInstrument({ holding, enrichment? })`.
 * Retourneert een `InstrumentClassification` met:
 *  - `instrumentType` (bv. `SINGLE_STOCK`, `INCOME_ETF`, ...)
 *  - `confidence` (HIGH/MEDIUM/LOW) — LOW wanneer we moeten raden
 *  - `rationale` — welke regels hebben gematcht (toonbaar in UI)
 *  - `metadata` — booleans voor downstream engines
 *
 * Volgorde van beslissing (waarom in deze volgorde):
 *   1. Cash-achtige instrumenten — eerst omdat ze heel specifiek zijn.
 *   2. Crypto — idem, kleine maar distincte groep.
 *   3. ETFs/fondsen — lookthrough via `classifyEtfByName` + enrichment
 *      zoals `fundProfile` / quoteType.
 *   4. Single stocks — fallback voor `EQUITY` zonder ETF-kenmerken.
 *   5. OTHER/UNKNOWN — laatste redmiddel. Confidence = LOW.
 *
 * Design-regel: **geen verzonnen data**. Elk veld in `metadata` is
 * afgeleid van óf enrichment óf een expliciete regel. Als iets onbekend
 * is, krijgt het de default (false) i.p.v. een gok.
 */

export interface ClassifyInstrumentInput {
  holding: Pick<
    Holding,
    "ticker" | "name" | "assetClass" | "currency"
  >;
  enrichment?: EnrichedInstrument | null;
}

export function classifyInstrument(
  input: ClassifyInstrumentInput,
): InstrumentClassification {
  const classifiedAt = new Date().toISOString();
  const { holding, enrichment } = input;

  const name = (holding.name ?? "").toUpperCase();
  const assetClass: AssetClass =
    (enrichment?.assetClass as AssetClass | undefined) ?? holding.assetClass;
  const quoteType = enrichment?.quoteType ?? null;

  // --- 1) Cash / money-market ----------------------------------------
  if (
    assetClass === "CASH" ||
    /\b(CASH|MONEY\s*MARKET|LIQUIDITY\s*FUND|OVERNIGHT\s*RATE)\b/.test(name) ||
    /\bTREASURY\s*BILL\b/.test(name)
  ) {
    const metadata: InstrumentMetadata = {
      ...defaultMetadata(),
      isBroadMarket: false,
      isIncomeFocused: true,
      incomeStrategy: "other",
      eligibleForWinnerRule: false,
    };
    return {
      instrumentType: "CASH",
      confidence: "HIGH",
      rationale: ["Cash- of money-market-positie — geen koersgevoeligheid."],
      metadata,
      classifiedAt,
    };
  }

  // --- 2) Crypto -----------------------------------------------------
  if (
    assetClass === "CRYPTO" ||
    quoteType?.toUpperCase() === "CRYPTOCURRENCY"
  ) {
    const metadata: InstrumentMetadata = {
      ...defaultMetadata(),
      isBroadMarket: false,
      isSpeculative: true,
      eligibleForWinnerRule: false,
    };
    return {
      instrumentType: "CRYPTO",
      confidence: "HIGH",
      rationale: ["Cryptocurrency — hoog volatiel, speculatieve categorie."],
      metadata,
      classifiedAt,
    };
  }

  // --- 3) ETF / mutualfund / fondsen ---------------------------------
  const treatAsFund =
    assetClass === "ETF" ||
    quoteType?.toUpperCase() === "ETF" ||
    quoteType?.toUpperCase() === "MUTUALFUND" ||
    /\b(ETF|UCITS|TRACKER|INDEX\s*FUND)\b/.test(name);

  if (treatAsFund) {
    const etfResult = classifyEtfByName({
      name: holding.name ?? "",
      enrichmentSector: enrichment?.sector ?? null,
    });

    const rationale = [...etfResult.rationale];
    // Extra provenance: waar komt de ETF-classificatie vandaan?
    if (enrichment?.assetClass === "ETF") {
      rationale.push("AssetClass bevestigd door Yahoo quoteType / fundProfile.");
    } else if (!enrichment) {
      rationale.push("Geen enrichment — classificatie is op naam gebaseerd.");
    }

    const metadata = buildEtfMetadata(etfResult);
    const confidence: ClassificationConfidence =
      etfResult.type === "UNKNOWN_ETF"
        ? "LOW"
        : enrichment
          ? "HIGH"
          : "MEDIUM";

    return {
      instrumentType: etfResult.type,
      confidence,
      rationale,
      metadata,
      classifiedAt,
    };
  }

  // --- 4) Single stocks ---------------------------------------------
  if (assetClass === "EQUITY" || quoteType?.toUpperCase() === "EQUITY") {
    const metadata: InstrumentMetadata = {
      ...defaultMetadata(),
      isBroadMarket: false,
      sectorFocus: enrichment?.sector ?? null,
      supportsFactorScoring: true,
      eligibleForWinnerRule: true,
    };
    const rationale: string[] = ["Individueel aandeel — factor-scoring actief."];
    if (enrichment?.sector) {
      rationale.push(`Sector: ${enrichment.sector}.`);
    }
    return {
      instrumentType: "SINGLE_STOCK",
      confidence: enrichment ? "HIGH" : "MEDIUM",
      rationale,
      metadata,
      classifiedAt,
    };
  }

  // --- 5) REIT / Bond / Commodity op Holding-niveau ------------------
  if (assetClass === "REIT") {
    return {
      instrumentType: "SINGLE_STOCK", // REITs zijn technisch aandelen; specifieke REIT-flag blijft buiten scope
      confidence: "MEDIUM",
      rationale: [
        "REIT-positie — behandeld als single stock met real-estate exposure.",
      ],
      metadata: {
        ...defaultMetadata(),
        sectorFocus: "Real Estate",
        isIncomeFocused: true,
        incomeStrategy: "high-dividend",
        supportsFactorScoring: true,
        eligibleForWinnerRule: true,
      },
      classifiedAt,
    };
  }
  if (assetClass === "BOND") {
    return {
      instrumentType: "BOND_ETF", // single-bond positie krijgt zelfde gedrag als bond-tracker voor onze engines
      confidence: "MEDIUM",
      rationale: ["Vastrentende positie."],
      metadata: {
        ...defaultMetadata(),
        isIncomeFocused: true,
        incomeStrategy: "bond-heavy",
        supportsFactorScoring: false,
      },
      classifiedAt,
    };
  }
  if (assetClass === "COMMODITY") {
    return {
      instrumentType: "COMMODITY_ETF",
      confidence: "MEDIUM",
      rationale: ["Commodity-positie."],
      metadata: {
        ...defaultMetadata(),
        isSpeculative: false,
      },
      classifiedAt,
    };
  }

  // --- 6) Fallback — onbekend --------------------------------------
  return {
    instrumentType: "UNKNOWN",
    confidence: "LOW",
    rationale: [
      "Asset class + naam leverden geen herkenbaar patroon op.",
      "Voeg ISIN toe of overweeg een manual override in symbol-overrides.ts.",
    ],
    metadata: defaultMetadata(),
    classifiedAt,
  };
}

// ============================================================
//  Bulk-helper
// ============================================================

export interface ClassifyInstrumentsInput {
  items: ClassifyInstrumentInput[];
}

/**
 * Bulk-variant. Puur synchroon: de classifier zelf heeft geen I/O, dus
 * we hoeven niets te parallelliseren. Retourneert een Map ticker →
 * classification zodat consumers direct per-holding kunnen lookupen.
 */
export function classifyInstruments(
  input: ClassifyInstrumentsInput,
): Map<string, InstrumentClassification> {
  const out = new Map<string, InstrumentClassification>();
  for (const item of input.items) {
    out.set(item.holding.ticker, classifyInstrument(item));
  }
  return out;
}

// ============================================================
//  Internal — metadata-builder per ETF-subtype
// ============================================================

function buildEtfMetadata(
  etfResult: ReturnType<typeof classifyEtfByName>,
): InstrumentMetadata {
  const base = defaultMetadata();
  switch (etfResult.type) {
    case "BROAD_MARKET_ETF":
      return {
        ...base,
        isBroadMarket: true,
        // Broad-market mag als "winner" in rebalance door blijven draaien;
        // factor-scoring op holding-niveau is niet zinvol (geen ROIC).
        eligibleForWinnerRule: true,
        supportsFactorScoring: false,
      };
    case "SECTOR_ETF":
      return {
        ...base,
        isBroadMarket: false,
        sectorFocus: etfResult.sectorFocus,
        // Sector-ETFs zijn geen "winners to run" — concentratie is precies
        // wat we willen bewaken. Rebalance-engine mag ze trimmen.
        eligibleForWinnerRule: false,
        supportsFactorScoring: false,
      };
    case "FACTOR_ETF":
      return {
        ...base,
        isBroadMarket: true, // factor-ETFs zijn wél breed gespreid per constructie
        eligibleForWinnerRule: true,
        supportsFactorScoring: false,
      };
    case "THEME_ETF":
      return {
        ...base,
        isBroadMarket: false,
        isSpeculative: true, // theme-ETFs zijn narrow en narratief-gedreven
        eligibleForWinnerRule: false,
        supportsFactorScoring: false,
      };
    case "INCOME_ETF":
      return {
        ...base,
        isIncomeFocused: true,
        incomeStrategy: etfResult.incomeStrategy ?? "other",
        // Covered-call ETFs hebben een capped upside — ze mogen niet
        // "doorlopen" zoals een broad-market winner, en factor-scoring is
        // niet zinvol.
        eligibleForWinnerRule: false,
        supportsFactorScoring: false,
      };
    case "BOND_ETF":
      return {
        ...base,
        isIncomeFocused: true,
        incomeStrategy: "bond-heavy",
        eligibleForWinnerRule: false,
        supportsFactorScoring: false,
      };
    case "COMMODITY_ETF":
      return {
        ...base,
        isBroadMarket: false,
        eligibleForWinnerRule: false,
        supportsFactorScoring: false,
      };
    case "LEVERAGED_OR_INVERSE":
      return {
        ...base,
        isBroadMarket: false,
        isSpeculative: true,
        // Nooit laten doorlopen — compounding drift is giftig.
        eligibleForWinnerRule: false,
        supportsFactorScoring: false,
      };
    case "UNKNOWN_ETF":
    default:
      return {
        ...base,
        isBroadMarket: false,
        supportsFactorScoring: false,
      };
  }
}
