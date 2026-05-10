/**
 * Snapshot-provider — leest macro-indicators uit de bestaande
 * `MarketSnapshot`-tabel.
 *
 * **Coverage** is partieel: het bestaande schema heeft typed kolommen
 * voor volatility, rate, inflation, breadth + een Json `indicators`-veld.
 * Liquiditeit, growth, recession-risk en sentiment komen vaak uit het
 * `indicators`-Json (als de feed dat aanlevert) of uit de seed-fallback.
 *
 * Dit is geen full FRED-/Bloomberg-vervanger; het is een eerste, eerlijke
 * gebruik van wat we al in de DB hebben staan.
 */

import { prisma } from "@/lib/data/prisma";

import type {
  MacroDataProvider,
  MacroDataSnapshot,
  RawMacroIndicator,
} from "./types";
import type { MacroIndicatorKey, MacroTrend } from "../types";

interface SnapshotRow {
  id: string;
  capturedAt: Date;
  volatilityIndex: { toNumber(): number } | null;
  interestRate10y: { toNumber(): number } | null;
  inflationYoy: { toNumber(): number } | null;
  breadthScore: { toNumber(): number } | null;
  indicators: unknown;
  source: string | null;
}

export class SnapshotMacroProvider implements MacroDataProvider {
  readonly id = "snapshot" as const;

  async fetch(): Promise<MacroDataSnapshot> {
    try {
      const [latest, previous] = (await prisma.marketSnapshot.findMany({
        orderBy: { capturedAt: "desc" },
        take: 2,
      })) as unknown as SnapshotRow[];

      if (!latest) {
        return {
          asOf: new Date().toISOString(),
          providerId: this.id,
          indicators: [],
        };
      }

      const json = extractJson(latest.indicators);
      const prevJson = extractJson(previous?.indicators);
      const indicators: RawMacroIndicator[] = [
        buildIndicator(
          "growth",
          readNumber(json.growthYoy),
          readNumber(prevJson.growthYoy),
          latest,
        ),
        buildIndicator(
          "inflation",
          numberFromDecimal(latest.inflationYoy),
          numberFromDecimal(previous?.inflationYoy ?? null),
          latest,
        ),
        buildIndicator(
          "rates",
          numberFromDecimal(latest.interestRate10y),
          numberFromDecimal(previous?.interestRate10y ?? null),
          latest,
        ),
        buildIndicator(
          "liquidity",
          readNumber(json.liquidityM2YoY),
          readNumber(prevJson.liquidityM2YoY),
          latest,
        ),
        buildIndicator(
          "recession_risk",
          readNumber(json.recessionProbability),
          readNumber(prevJson.recessionProbability),
          latest,
        ),
        buildIndicator(
          "volatility",
          numberFromDecimal(latest.volatilityIndex),
          numberFromDecimal(previous?.volatilityIndex ?? null),
          latest,
        ),
        buildIndicator(
          "sentiment",
          readNumber(json.sentimentScore),
          readNumber(prevJson.sentimentScore),
          latest,
        ),
      ];

      return {
        asOf: latest.capturedAt.toISOString(),
        providerId: this.id,
        indicators,
      };
    } catch {
      return {
        asOf: new Date().toISOString(),
        providerId: this.id,
        indicators: [],
      };
    }
  }
}

// ============================================================
//  Helpers
// ============================================================

function buildIndicator(
  key: MacroIndicatorKey,
  value: number | null,
  previousValue: number | null,
  latest: SnapshotRow,
): RawMacroIndicator {
  const trend = deriveTrend(value, previousValue);
  return {
    key,
    value,
    previousValue,
    trend,
    asOf: latest.capturedAt.toISOString(),
    source: latest.source ?? "MarketSnapshot",
    confidence: value !== null ? 0.85 : 0,
  };
}

function deriveTrend(
  value: number | null,
  previousValue: number | null,
): MacroTrend {
  if (value === null || previousValue === null) return "unknown";
  const delta = value - previousValue;
  // Tolerantie 5% van previous (of 0.05 absolute voor kleine waarden) om
  // ruis niet als trend te markeren.
  const tolerance = Math.max(Math.abs(previousValue) * 0.05, 0.05);
  if (delta > tolerance) return "rising";
  if (delta < -tolerance) return "falling";
  return "stable";
}

function extractJson(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

function readNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function numberFromDecimal(
  d: { toNumber(): number } | null | undefined,
): number | null {
  if (!d) return null;
  const n = d.toNumber();
  return Number.isFinite(n) ? n : null;
}
