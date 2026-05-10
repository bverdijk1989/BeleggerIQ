"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { matchesSessionUser, resolveUserFromServer } from "@/lib/auth";
import { portfolioRepository, taxValuationRepository } from "@/lib/data";

/**
 * Server actions voor de /belasting pagina:
 *  - `saveManualValuation`   upsert handmatig peildatum-bedrag
 *  - `deleteManualValuation` verwijder een peildatum-bedrag (terug naar snapshot/missing)
 */

export interface SaveValuationInput {
  portfolioId: string;
  peilYear: number;
  totalValue: number;
  source?: string;
  note?: string;
}

export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function saveManualValuation(
  input: SaveValuationInput,
): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  if (!Number.isFinite(input.totalValue) || input.totalValue < 0) {
    return { ok: false, message: "Voer een geldig bedrag ≥ 0 in." };
  }
  if (
    !Number.isFinite(input.peilYear) ||
    input.peilYear < 2000 ||
    input.peilYear > 2100
  ) {
    return { ok: false, message: "Belastingjaar buiten bereik." };
  }

  const ownerEmail = await portfolioRepository.findOwnerEmailById(
    input.portfolioId,
  );
  if (!ownerEmail) return { ok: false, message: "Portefeuille niet gevonden." };
  if (!matchesSessionUser(auth.user, ownerEmail)) {
    return { ok: false, message: "Geen rechten." };
  }

  await taxValuationRepository.upsert({
    portfolioId: input.portfolioId,
    peilYear: input.peilYear,
    asOf: new Date(Date.UTC(input.peilYear, 0, 1)),
    totalValue: input.totalValue,
    baseCurrency: "EUR",
    source: input.source ?? null,
    note: input.note ?? null,
  });

  await audit.record({
    userEmail: auth.user.email,
    category: "tax",
    action: "valuation_upsert",
    resourceType: "TaxValuation",
    resourceId: `${input.portfolioId}:${input.peilYear}`,
    summary: `Manual peildatum-waardering ${input.peilYear} = €${Math.round(input.totalValue)}`,
    metadata: {
      peilYear: input.peilYear,
      totalValue: input.totalValue,
      source: input.source ?? null,
    },
  });

  revalidatePath("/belasting");
  return { ok: true };
}

export async function deleteManualValuation(input: {
  portfolioId: string;
  peilYear: number;
}): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  const ownerEmail = await portfolioRepository.findOwnerEmailById(
    input.portfolioId,
  );
  if (!ownerEmail) return { ok: false, message: "Portefeuille niet gevonden." };
  if (!matchesSessionUser(auth.user, ownerEmail)) {
    return { ok: false, message: "Geen rechten." };
  }

  await taxValuationRepository.delete(input.portfolioId, input.peilYear);

  await audit.record({
    userEmail: auth.user.email,
    category: "tax",
    action: "valuation_delete",
    resourceType: "TaxValuation",
    resourceId: `${input.portfolioId}:${input.peilYear}`,
    summary: `Manual peildatum-waardering ${input.peilYear} verwijderd`,
    metadata: { peilYear: input.peilYear },
  });

  revalidatePath("/belasting");
  return { ok: true };
}
