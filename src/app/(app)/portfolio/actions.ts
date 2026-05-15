"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { matchesSessionUser, resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
import { prisma } from "@/lib/data/prisma";
import { log } from "@/lib/log";
import {
  parseDegiroCsv,
  toHoldingDrafts,
  type DegiroImportResult,
} from "@/lib/parsers/degiro";

/**
 * Server actions voor de portfolio-pagina.
 *
 * Parser draait client-side (voor instant preview); deze actions handelen
 * de commit af en laten de businesslogica volledig buiten de UI.
 */

export interface ImportDegiroInput {
  csv: string;
  portfolioId?: string;
}

export interface ImportDegiroResult {
  ok: boolean;
  message: string;
  parseResult?: DegiroImportResult;
  created?: number;
  updated?: number;
  skipped?: number;
}

/**
 * Parsed de meegestuurde CSV opnieuw serverside (zodat de client de response
 * niet kan manipuleren) en upsert de holdings op de aangegeven portfolio.
 */
export async function importDegiroCsv(
  input: ImportDegiroInput,
): Promise<ImportDegiroResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) {
    return { ok: false, message: auth.error };
  }

  if (!input.csv || !input.csv.trim()) {
    return { ok: false, message: "Leeg CSV-bestand." };
  }

  const parseResult = parseDegiroCsv(input.csv);

  if (parseResult.holdings.length === 0) {
    return {
      ok: false,
      message:
        parseResult.warnings[0] ??
        "Geen importbare open posities gevonden in dit bestand.",
      parseResult,
    };
  }

  let portfolio: { id: string } | null;
  if (input.portfolioId !== undefined) {
    const ownerEmail = await portfolioRepository.findOwnerEmailById(
      input.portfolioId,
    );
    if (!ownerEmail) {
      return { ok: false, message: "Portefeuille bestaat niet.", parseResult };
    }
    if (!matchesSessionUser(auth.user, ownerEmail)) {
      return {
        ok: false,
        message: "Geen rechten om in deze portefeuille te importeren.",
        parseResult,
      };
    }
    portfolio = { id: input.portfolioId };
  } else {
    portfolio = await portfolioRepository.findPrimaryByEmail(auth.user.email);
  }

  if (!portfolio) {
    return {
      ok: false,
      message:
        "Geen portefeuille gevonden om in te importeren. Maak eerst een portefeuille aan.",
      parseResult,
    };
  }

  try {
    const drafts = toHoldingDrafts(parseResult.holdings);
    const { created, updated } = await portfolioRepository.upsertHoldings(
      portfolio.id,
      drafts,
    );

    revalidatePath("/portfolio");
    revalidatePath("/dashboard");

    // Audit-trail: importeer-actie raakt holdings — bewaren voor compliance.
    await audit.record({
      userEmail: auth.user.email,
      category: "transactions",
      action: "import_degiro",
      resourceType: "Portfolio",
      resourceId: portfolio.id,
      summary: `${created} nieuwe + ${updated} bijgewerkte posities geïmporteerd via DEGIRO-CSV`,
      metadata: {
        created,
        updated,
        skipped: parseResult.skipped.length,
        warnings: parseResult.warnings.length,
      },
    });

    return {
      ok: true,
      message: `${created} nieuwe en ${updated} bijgewerkte posities geïmporteerd.`,
      parseResult,
      created,
      updated,
      skipped: parseResult.skipped.length,
    };
  } catch (error) {
    // Sanitized client-response (geen rauwe error.message naar de browser).
    log.error("portfolio", "import_degiro_failed", {
      portfolioId: portfolio.id,
      rawMessage: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "non-error",
    });
    return {
      ok: false,
      message: "Importeren mislukt door een interne fout. Probeer het opnieuw.",
      parseResult,
    };
  }
}

// ============================================================
//  Add single position
// ============================================================

export interface AddPositionInput {
  portfolioId: string;
  ticker: string;
  name: string;
  quantity: number;
  avgCostPrice: number;
  currency: string;
  assetClass:
    | "EQUITY"
    | "ETF"
    | "BOND"
    | "REIT"
    | "COMMODITY"
    | "CRYPTO"
    | "OTHER";
  sector?: string | null;
  region?: string | null;
  isin?: string | null;
}

export interface AddPositionResult {
  ok: boolean;
  message: string;
  holdingId?: string;
}

function validateAddPosition(
  input: unknown,
): { ok: true; value: AddPositionInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Invalid input." };
  }
  const o = input as Record<string, unknown>;
  if (typeof o.portfolioId !== "string" || o.portfolioId.length === 0) {
    return { ok: false, error: "Portfolio ontbreekt." };
  }
  if (typeof o.ticker !== "string") {
    return { ok: false, error: "Ticker ontbreekt." };
  }
  const ticker = o.ticker.trim().toUpperCase();
  if (ticker.length === 0 || ticker.length > 32) {
    return { ok: false, error: "Ticker moet 1-32 tekens zijn." };
  }
  if (!/^[A-Z0-9./\-]+$/.test(ticker)) {
    return { ok: false, error: "Ticker bevat ongeldige tekens." };
  }
  if (typeof o.name !== "string" || o.name.trim().length === 0) {
    return { ok: false, error: "Naam is verplicht." };
  }
  if (typeof o.quantity !== "number" || !Number.isFinite(o.quantity) || o.quantity <= 0) {
    return { ok: false, error: "Aantal moet groter dan 0 zijn." };
  }
  if (
    typeof o.avgCostPrice !== "number" ||
    !Number.isFinite(o.avgCostPrice) ||
    o.avgCostPrice < 0
  ) {
    return { ok: false, error: "Gemiddelde kostprijs moet ≥ 0 zijn." };
  }
  if (typeof o.currency !== "string" || !/^[A-Z]{3}$/.test(o.currency)) {
    return { ok: false, error: "Ongeldige valuta (3 letters, bv. EUR)." };
  }
  const validAssetClasses = [
    "EQUITY",
    "ETF",
    "BOND",
    "REIT",
    "COMMODITY",
    "CRYPTO",
    "OTHER",
  ];
  if (
    typeof o.assetClass !== "string" ||
    !validAssetClasses.includes(o.assetClass)
  ) {
    return { ok: false, error: "Ongeldige asset-class." };
  }
  return {
    ok: true,
    value: {
      portfolioId: o.portfolioId,
      ticker,
      name: o.name.trim().slice(0, 120),
      quantity: o.quantity,
      avgCostPrice: o.avgCostPrice,
      currency: o.currency,
      assetClass: o.assetClass as AddPositionInput["assetClass"],
      sector:
        typeof o.sector === "string" && o.sector.length <= 80
          ? o.sector.trim() || null
          : null,
      region:
        typeof o.region === "string" && o.region.length <= 80
          ? o.region.trim() || null
          : null,
      isin:
        typeof o.isin === "string" && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(o.isin)
          ? o.isin.trim()
          : null,
    },
  };
}

export async function addPositionAction(
  input: AddPositionInput,
): Promise<AddPositionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  const validated = validateAddPosition(input);
  if (!validated.ok) {
    return { ok: false, message: validated.error };
  }
  const v = validated.value;

  // Ownership check.
  const ownerEmail = await portfolioRepository.findOwnerEmailById(v.portfolioId);
  if (!ownerEmail) {
    return { ok: false, message: "Portefeuille bestaat niet." };
  }
  if (!matchesSessionUser(auth.user, ownerEmail)) {
    return { ok: false, message: "Geen rechten op deze portefeuille." };
  }

  try {
    const { created, updated } = await portfolioRepository.upsertHoldings(
      v.portfolioId,
      [
        {
          ticker: v.ticker,
          name: v.name,
          quantity: v.quantity,
          avgCostPrice: v.avgCostPrice,
          currency: v.currency as "EUR" | "USD" | "GBP" | "CHF" | "JPY",
          assetClass: v.assetClass,
          sector: v.sector,
          region: v.region,
          isin: v.isin,
        },
      ],
    );

    revalidatePath("/portfolio");
    revalidatePath("/dashboard");

    await audit.record({
      userEmail: auth.user.email,
      category: "transactions",
      action: created > 0 ? "position_add" : "position_update",
      resourceType: "Portfolio",
      resourceId: v.portfolioId,
      summary:
        created > 0
          ? `Positie ${v.ticker} toegevoegd (${v.quantity} @ ${v.avgCostPrice} ${v.currency})`
          : `Positie ${v.ticker} bijgewerkt`,
      metadata: { ticker: v.ticker, assetClass: v.assetClass },
    });

    return {
      ok: true,
      message:
        created > 0
          ? `${v.ticker} toegevoegd aan je portefeuille.`
          : `${v.ticker} stond al in je portefeuille — bijgewerkt.`,
    };
  } catch (error) {
    log.error("portfolio", "add_position_failed", {
      portfolioId: v.portfolioId,
      rawMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      message: "Toevoegen mislukt door een interne fout. Probeer het opnieuw.",
    };
  }
}

// ============================================================
//  Update cash balance
// ============================================================

export interface UpdateCashInput {
  portfolioId: string;
  cashBalance: number;
}

export interface UpdateCashResult {
  ok: boolean;
  message: string;
}

export async function updateCashBalanceAction(
  input: UpdateCashInput,
): Promise<UpdateCashResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  if (
    typeof input?.portfolioId !== "string" ||
    input.portfolioId.length === 0
  ) {
    return { ok: false, message: "Portfolio ontbreekt." };
  }
  if (
    typeof input.cashBalance !== "number" ||
    !Number.isFinite(input.cashBalance) ||
    input.cashBalance < 0 ||
    input.cashBalance > 1_000_000_000
  ) {
    return { ok: false, message: "Cash-bedrag moet tussen 0 en 1.000.000.000 liggen." };
  }

  const ownerEmail = await portfolioRepository.findOwnerEmailById(input.portfolioId);
  if (!ownerEmail) {
    return { ok: false, message: "Portefeuille bestaat niet." };
  }
  if (!matchesSessionUser(auth.user, ownerEmail)) {
    return { ok: false, message: "Geen rechten op deze portefeuille." };
  }

  try {
    await portfolioRepository.updateCashBalance(
      input.portfolioId,
      input.cashBalance,
    );

    revalidatePath("/portfolio");
    revalidatePath("/dashboard");

    await audit.record({
      userEmail: auth.user.email,
      category: "transactions",
      action: "cash_balance_update",
      resourceType: "Portfolio",
      resourceId: input.portfolioId,
      summary: `Cash-balans geüpdatet naar ${input.cashBalance.toFixed(2)}`,
      metadata: { newBalance: input.cashBalance },
    });

    return { ok: true, message: `Cash-balans bijgewerkt naar ${input.cashBalance.toFixed(2)}.` };
  } catch (error) {
    log.error("portfolio", "update_cash_failed", {
      portfolioId: input.portfolioId,
      rawMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      message: "Cash-update mislukt. Probeer het opnieuw.",
    };
  }
}

// ============================================================
//  Update single position (by holding-id)
// ============================================================

export interface UpdatePositionInput {
  holdingId: string;
  name?: string;
  quantity?: number;
  avgCostPrice?: number;
  sector?: string | null;
  region?: string | null;
  isin?: string | null;
}

export interface UpdatePositionResult {
  ok: boolean;
  message: string;
}

export async function updatePositionAction(
  input: UpdatePositionInput,
): Promise<UpdatePositionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  if (typeof input?.holdingId !== "string" || input.holdingId.length === 0) {
    return { ok: false, message: "Holding-id ontbreekt." };
  }

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) {
    if (typeof input.name !== "string" || input.name.trim().length === 0) {
      return { ok: false, message: "Naam mag niet leeg zijn." };
    }
    updates.name = input.name.trim().slice(0, 120);
  }
  if (input.quantity !== undefined) {
    if (
      typeof input.quantity !== "number" ||
      !Number.isFinite(input.quantity) ||
      input.quantity <= 0
    ) {
      return { ok: false, message: "Aantal moet groter dan 0 zijn." };
    }
    updates.quantity = input.quantity;
  }
  if (input.avgCostPrice !== undefined) {
    if (
      typeof input.avgCostPrice !== "number" ||
      !Number.isFinite(input.avgCostPrice) ||
      input.avgCostPrice < 0
    ) {
      return { ok: false, message: "Gemiddelde kostprijs moet ≥ 0 zijn." };
    }
    updates.avgCostPrice = input.avgCostPrice;
  }
  if (input.sector !== undefined) {
    updates.sector =
      typeof input.sector === "string" && input.sector.length <= 80
        ? input.sector.trim() || null
        : null;
  }
  if (input.region !== undefined) {
    updates.region =
      typeof input.region === "string" && input.region.length <= 80
        ? input.region.trim() || null
        : null;
  }
  if (input.isin !== undefined) {
    if (input.isin === null || input.isin === "") {
      updates.isin = null;
    } else if (
      typeof input.isin === "string" &&
      /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(input.isin)
    ) {
      updates.isin = input.isin.trim();
    } else {
      return { ok: false, message: "ISIN heeft verkeerd formaat (12 chars)." };
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, message: "Geen wijzigingen om op te slaan." };
  }

  try {
    const holding = await prisma.holding.findUnique({
      where: { id: input.holdingId },
      select: {
        id: true,
        ticker: true,
        portfolioId: true,
        portfolio: { select: { userId: true } },
      },
    });
    if (!holding) {
      return { ok: false, message: "Positie bestaat niet." };
    }
    const ctx = await portfolioRepository
      .findUserContextByEmail(auth.user.email)
      .catch(() => null);
    if (!ctx?.userId || ctx.userId !== holding.portfolio.userId) {
      return { ok: false, message: "Geen rechten op deze positie." };
    }

    await prisma.holding.update({
      where: { id: input.holdingId },
      data: updates,
    });

    revalidatePath("/portfolio");
    revalidatePath("/dashboard");

    await audit.record({
      userEmail: auth.user.email,
      category: "transactions",
      action: "position_update",
      resourceType: "Holding",
      resourceId: input.holdingId,
      summary: `Positie ${holding.ticker} bijgewerkt (${Object.keys(updates).join(", ")})`,
      metadata: { fields: Object.keys(updates) },
    });

    return { ok: true, message: `${holding.ticker} bijgewerkt.` };
  } catch (error) {
    log.error("portfolio", "update_position_failed", {
      holdingId: input.holdingId,
      rawMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      message: "Bijwerken mislukt. Probeer het opnieuw.",
    };
  }
}

// ============================================================
//  Delete position
// ============================================================

export interface DeletePositionInput {
  holdingId: string;
}

export interface DeletePositionResult {
  ok: boolean;
  message: string;
}

export async function deletePositionAction(
  input: DeletePositionInput,
): Promise<DeletePositionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  if (typeof input?.holdingId !== "string" || input.holdingId.length === 0) {
    return { ok: false, message: "Holding-id ontbreekt." };
  }

  try {
    const holding = await prisma.holding.findUnique({
      where: { id: input.holdingId },
      select: {
        id: true,
        ticker: true,
        portfolioId: true,
        portfolio: { select: { userId: true } },
      },
    });
    if (!holding) {
      return { ok: false, message: "Positie bestaat al niet meer." };
    }
    const ctx = await portfolioRepository
      .findUserContextByEmail(auth.user.email)
      .catch(() => null);
    if (!ctx?.userId || ctx.userId !== holding.portfolio.userId) {
      return { ok: false, message: "Geen rechten op deze positie." };
    }

    await prisma.holding.delete({ where: { id: input.holdingId } });

    revalidatePath("/portfolio");
    revalidatePath("/dashboard");

    await audit.record({
      userEmail: auth.user.email,
      category: "transactions",
      action: "position_delete",
      resourceType: "Holding",
      resourceId: input.holdingId,
      summary: `Positie ${holding.ticker} verwijderd`,
      metadata: { ticker: holding.ticker },
    });

    return { ok: true, message: `${holding.ticker} verwijderd.` };
  } catch (error) {
    log.error("portfolio", "delete_position_failed", {
      holdingId: input.holdingId,
      rawMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      message: "Verwijderen mislukt door een interne fout.",
    };
  }
}
