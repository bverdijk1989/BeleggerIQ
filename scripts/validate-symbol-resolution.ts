/**
 * Validatie-script voor de symbol-resolver.
 *
 * Doel: bevestigen dat de tickers + ISINs uit je eigen Holdings-tabel
 * correct naar Yahoo-symbolen worden gemapped. Doet **echte** Yahoo
 * search-calls — geen mocks, geen fixtures.
 *
 * Gebruik (op de server als beleggeriq-user):
 *
 *   cd /var/www/beleggeriq/current
 *   MARKET_DATA_PROVIDER=yahoo npx tsx scripts/validate-symbol-resolution.ts
 *
 * Output: tabel per holding met:
 *   ticker | isin | resolved | exchange | quoteType | matched | confidence | verdict
 *
 * Verdict-kolom markeert verdachte cases:
 *   ✅  OK          — matched én quoteType + exchange consistent met verwachting
 *   ⚠️  CHECK       — matched maar onverwachte exchange of quoteType
 *   ❌  NO MATCH    — Yahoo vond niks
 *   🔍  NO ISIN     — ticker-only search (minder betrouwbaar)
 *
 * Het script muteert niets in de DB. Optioneel: voeg `--json` toe voor
 * machine-leesbare output, bv. om later te vergelijken tussen runs.
 */

import { prisma } from "@/lib/data/prisma";
import {
  enrichInstrument,
  type EnrichedInstrument,
} from "@/lib/data/instrument-enrichment";
import { resolveYahooMatch } from "@/lib/data/symbol-resolver";

interface ValidationRow {
  ticker: string;
  name: string;
  isin: string | null;
  resolved: string;
  exchange: string | null;
  quoteType: string | null;
  matched: boolean;
  confidence: number;
  sector: string | null;
  region: string;
  verdict: "OK" | "CHECK" | "NO_MATCH" | "NO_ISIN";
  warnings: string[];
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json");
  const portfolioFilter = process.argv.find((a) => a.startsWith("--portfolio="));
  const portfolioId = portfolioFilter?.split("=")[1];

  if (process.env.MARKET_DATA_PROVIDER !== "yahoo") {
    console.warn(
      "⚠️  MARKET_DATA_PROVIDER != 'yahoo'. Dit script heeft alleen zin tegen de Yahoo-provider.",
    );
    console.warn("   Zet: MARKET_DATA_PROVIDER=yahoo npx tsx scripts/...");
    process.exit(2);
  }

  const holdings = await prisma.holding.findMany({
    where: portfolioId ? { portfolioId } : undefined,
    select: {
      ticker: true,
      name: true,
      isin: true,
      currency: true,
      assetClass: true,
    },
    orderBy: { ticker: "asc" },
  });

  if (holdings.length === 0) {
    console.warn("Geen holdings gevonden. Portfolio leeg of filter te strikt?");
    process.exit(0);
  }

  // Dedup op (ticker, isin) — we willen elk unieke instrument één keer valideren.
  const seen = new Set<string>();
  const unique = holdings.filter((h) => {
    const key = `${h.isin ?? ""}::${h.ticker}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!asJson) {
    console.log(
      `\nValidatie van ${unique.length} unieke instrumenten (van ${holdings.length} holdings)…\n`,
    );
  }

  const results: ValidationRow[] = [];
  for (const h of unique) {
    const row = await validateOne(h);
    results.push(row);
    if (!asJson) printRow(row);
  }

  // Samenvatting
  const ok = results.filter((r) => r.verdict === "OK").length;
  const check = results.filter((r) => r.verdict === "CHECK").length;
  const noMatch = results.filter((r) => r.verdict === "NO_MATCH").length;
  const noIsin = results.filter((r) => r.verdict === "NO_ISIN").length;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          total: results.length,
          summary: { ok, check, noMatch, noIsin },
          rows: results,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("\n" + "─".repeat(100));
    console.log(
      `Totaal ${results.length}  ·  ✅ ${ok}  ·  ⚠️  ${check}  ·  ❌ ${noMatch}  ·  🔍 ${noIsin}`,
    );
    if (check > 0 || noMatch > 0) {
      console.log("\nAandachtspunten:");
      for (const r of results.filter(
        (r) => r.verdict === "CHECK" || r.verdict === "NO_MATCH",
      )) {
        console.log(
          `  • ${r.ticker.padEnd(14)} → ${r.resolved.padEnd(14)} (${r.verdict})${
            r.warnings[0] ? ` — ${r.warnings[0]}` : ""
          }`,
        );
      }
      console.log(
        "\nManuele override mogelijk via HoldingSymbolOverride (zie docs).",
      );
    }
  }

  await prisma.$disconnect();
}

async function validateOne(h: {
  ticker: string;
  name: string;
  isin: string | null;
  currency: string;
  assetClass: string;
}): Promise<ValidationRow> {
  try {
    const match = await resolveYahooMatch(h.ticker, h.isin);
    const enrichment: EnrichedInstrument = await enrichInstrument({
      ticker: h.ticker,
      isin: h.isin,
      name: h.name,
    });

    const verdict = classifyVerdict({
      matched: match.matched,
      hasIsin: Boolean(h.isin),
      matchedCurrency: enrichment.currency,
      holdingCurrency: h.currency,
      assetClass: enrichment.assetClass,
      holdingAssetClass: h.assetClass,
    });

    return {
      ticker: h.ticker,
      name: h.name,
      isin: h.isin,
      resolved: match.symbol,
      exchange: match.exchange,
      quoteType: match.quoteType,
      matched: match.matched,
      confidence: enrichment.confidence,
      sector: enrichment.sector,
      region: enrichment.region,
      verdict,
      warnings: buildWarnings({
        match,
        enrichment,
        holding: h,
        verdict,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return {
      ticker: h.ticker,
      name: h.name,
      isin: h.isin,
      resolved: h.ticker,
      exchange: null,
      quoteType: null,
      matched: false,
      confidence: 0,
      sector: null,
      region: "Unknown",
      verdict: "NO_MATCH",
      warnings: [`Script error: ${message}`],
    };
  }
}

function classifyVerdict(ctx: {
  matched: boolean;
  hasIsin: boolean;
  matchedCurrency: string | null;
  holdingCurrency: string;
  assetClass: string;
  holdingAssetClass: string;
}): ValidationRow["verdict"] {
  if (!ctx.matched) {
    return ctx.hasIsin ? "NO_MATCH" : "NO_ISIN";
  }

  // Currency-mismatch is verdacht: Yahoo's first-match gaf mogelijk de
  // verkeerde beurs (bv. US-ADR i.p.v. European listing).
  if (
    ctx.matchedCurrency &&
    ctx.holdingCurrency &&
    ctx.matchedCurrency !== ctx.holdingCurrency
  ) {
    return "CHECK";
  }

  // Asset-class-mismatch: holding staat als ETF maar Yahoo zegt EQUITY (of omgekeerd).
  if (
    ctx.holdingAssetClass &&
    ctx.assetClass &&
    ctx.holdingAssetClass !== ctx.assetClass &&
    ctx.holdingAssetClass !== "OTHER"
  ) {
    return "CHECK";
  }

  return "OK";
}

function buildWarnings(ctx: {
  match: { matched: boolean };
  enrichment: EnrichedInstrument;
  holding: { ticker: string; currency: string; assetClass: string };
  verdict: ValidationRow["verdict"];
}): string[] {
  const out: string[] = [...ctx.enrichment.warnings];

  if (
    ctx.enrichment.currency &&
    ctx.enrichment.currency !== ctx.holding.currency
  ) {
    out.push(
      `Currency mismatch: holding=${ctx.holding.currency}, Yahoo=${ctx.enrichment.currency}`,
    );
  }
  if (
    ctx.enrichment.assetClass !== ctx.holding.assetClass &&
    ctx.holding.assetClass !== "OTHER"
  ) {
    out.push(
      `AssetClass mismatch: holding=${ctx.holding.assetClass}, Yahoo=${ctx.enrichment.assetClass}`,
    );
  }
  return out;
}

function printRow(r: ValidationRow): void {
  const icon =
    r.verdict === "OK"
      ? "✅"
      : r.verdict === "CHECK"
        ? "⚠️ "
        : r.verdict === "NO_MATCH"
          ? "❌"
          : "🔍";
  const ticker = r.ticker.padEnd(14);
  const isin = (r.isin ?? "—").padEnd(14);
  const resolved = r.resolved.padEnd(14);
  const exchange = (r.exchange ?? "—").padEnd(5);
  const quoteType = (r.quoteType ?? "—").padEnd(12);
  const conf = `${Math.round(r.confidence * 100)}%`.padStart(4);
  console.log(
    `${icon} ${ticker} ${isin} → ${resolved} ${exchange} ${quoteType} conf=${conf}`,
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  void prisma.$disconnect();
  process.exit(1);
});
