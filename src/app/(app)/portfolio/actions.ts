"use server";

import { revalidatePath } from "next/cache";

import { matchesSessionUser, resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository } from "@/lib/data";
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

    return {
      ok: true,
      message: `${created} nieuwe en ${updated} bijgewerkte posities geïmporteerd.`,
      parseResult,
      created,
      updated,
      skipped: parseResult.skipped.length,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Onbekende fout bij het importeren.";
    return { ok: false, message, parseResult };
  }
}
