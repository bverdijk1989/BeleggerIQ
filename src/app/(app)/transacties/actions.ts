"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { matchesSessionUser, resolveUserFromServer } from "@/lib/auth";
import {
  portfolioRepository,
  transactionRepository,
  type BulkImportOutcome,
} from "@/lib/data";
import { parseDegiroCsv } from "@/lib/transactions/degiro-parser";
import type {
  ParsedTransaction,
  ParseResult,
} from "@/lib/transactions/types";

/**
 * Server actions voor de transactie-import-flow.
 *
 * Twee actions:
 *  - `previewTransactionsCsv` — pure parse, geen DB-writes. UI gebruikt
 *    'em om de gebruiker een tabel te tonen vóórdat 'ie commit.
 *  - `commitTransactionsCsv` — parse opnieuw serverside (vertrouw nooit
 *    een client-payload), upsert via repository, revalidate de pagina.
 */

export interface PreviewInput {
  csv: string;
}

export interface PreviewResult {
  ok: boolean;
  message?: string;
  parsed?: ParseResult;
  /** Pre-existing externalIds — UI markeert die als duplicate. */
  existingExternalIds?: string[];
}

export interface CommitInput {
  csv: string;
  portfolioId?: string;
}

export interface CommitResult {
  ok: boolean;
  message: string;
  outcome?: BulkImportOutcome;
  parsedCount?: number;
  parseErrors?: number;
}

async function resolvePortfolio(
  user: { email: string; source: "session-cookie" | "dev-header" | "demo-fallback" },
  explicit: string | undefined,
): Promise<{ id: string } | { error: string }> {
  if (explicit) {
    const ownerEmail = await portfolioRepository.findOwnerEmailById(explicit);
    if (!ownerEmail) return { error: "Portefeuille bestaat niet." };
    if (!matchesSessionUser(user, ownerEmail)) {
      return { error: "Geen rechten om in deze portefeuille te importeren." };
    }
    return { id: explicit };
  }
  const primary = await portfolioRepository.findPrimaryByEmail(user.email);
  if (!primary) return { error: "Geen portefeuille gevonden voor je account." };
  return { id: primary.id };
}

export async function previewTransactionsCsv(
  input: PreviewInput,
): Promise<PreviewResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };
  if (!input.csv || !input.csv.trim()) {
    return { ok: false, message: "Leeg CSV-bestand." };
  }

  const parsed = parseDegiroCsv(input.csv);
  if (parsed.transactions.length === 0 && parsed.errors.length === 0) {
    return {
      ok: false,
      message: "Geen transactierijen gevonden in dit bestand.",
      parsed,
    };
  }

  // Lookup duplicates: voor de primary portfolio van de user.
  const primary = await portfolioRepository.findPrimaryByEmail(auth.user.email);
  let existingExternalIds: string[] = [];
  if (primary) {
    const existing = await transactionRepository.list({
      portfolioId: primary.id,
    });
    const ids = new Set(parsed.transactions.map((t) => t.externalId));
    existingExternalIds = existing
      .map((row) => row.externalId)
      .filter((id): id is string => !!id && ids.has(id));
  }

  return {
    ok: true,
    parsed,
    existingExternalIds,
  };
}

export async function commitTransactionsCsv(
  input: CommitInput,
): Promise<CommitResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };
  if (!input.csv || !input.csv.trim()) {
    return { ok: false, message: "Leeg CSV-bestand." };
  }

  const parsed = parseDegiroCsv(input.csv);
  if (parsed.transactions.length === 0) {
    return {
      ok: false,
      message:
        parsed.errors[0]?.reason ??
        "Geen transactierijen gevonden — niets om te importeren.",
      parsedCount: 0,
      parseErrors: parsed.errors.length,
    };
  }

  const portfolio = await resolvePortfolio(auth.user, input.portfolioId);
  if ("error" in portfolio) {
    return { ok: false, message: portfolio.error };
  }

  const outcome = await transactionRepository.bulkImport({
    portfolioId: portfolio.id,
    parsed: parsed.transactions as ParsedTransaction[],
  });

  revalidatePath("/transacties");
  revalidatePath("/portfolio");
  revalidatePath("/dashboard");

  // Audit-trail: transactie-import raakt financiële data — bewaren voor
  // compliance (belastingaangifte, audit-controle, etc.).
  await audit.record({
    userEmail: auth.user.email,
    category: "transactions",
    action: "import_transactions",
    resourceType: "Portfolio",
    resourceId: portfolio.id,
    summary: `${outcome.inserted} nieuwe transacties geïmporteerd, ${outcome.skipped} duplicaten`,
    metadata: {
      inserted: outcome.inserted,
      skipped: outcome.skipped,
      errors: outcome.errors,
      parsedRows: parsed.transactions.length,
    },
  });

  return {
    ok: outcome.errors === 0,
    message: `${outcome.inserted} nieuwe transacties, ${outcome.skipped} duplicaten overgeslagen, ${outcome.errors} fouten.`,
    outcome,
    parsedCount: parsed.transactions.length,
    parseErrors: parsed.errors.length,
  };
}
