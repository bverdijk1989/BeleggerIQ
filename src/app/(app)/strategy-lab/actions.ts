"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { resolveUserFromServer } from "@/lib/auth";
import {
  strategyPresetRepository,
  type StrategyPresetRow,
} from "@/lib/data/strategy-preset-repository";
import { log } from "@/lib/log";

/**
 * Server actions voor Strategy Lab. Owner is altijd de ingelogde user —
 * presets van andere users kunnen niet overschreven of verwijderd worden.
 */

export interface SavePresetActionInput {
  /** Bestaande slug als we een preset updaten; leeg bij nieuwe. */
  slug?: string;
  name: string;
  description?: string;
  rebalance?: "monthly" | "quarterly" | "semiannual" | "annual" | "none";
  maxPositions?: number | null;
  maxPositionWeight?: number | null;
  factorWeights: {
    quality: number;
    value: number;
    momentum: number;
    lowVol: number;
  };
  toggles: {
    requireDividend: boolean;
    defensiveOverlay: boolean;
    useMomentum: boolean;
  };
  limits: {
    maxSectorWeight?: number | null;
  };
}

export interface SavePresetResult {
  ok: boolean;
  message: string;
  preset?: StrategyPresetRow;
}

export async function savePreset(
  input: SavePresetActionInput,
): Promise<SavePresetResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  const name = input.name.trim();
  if (!name) {
    return { ok: false, message: "Naam is verplicht." };
  }

  try {
    const saved = await strategyPresetRepository.save({
      slug: input.slug,
      name,
      description: input.description?.trim() ?? "",
      type: "CUSTOM",
      tags: [],
      ownerEmail: auth.user.email,
      rebalance: mapRebalance(input.rebalance),
      maxPositions: input.maxPositions ?? null,
      maxPositionWeight: input.maxPositionWeight ?? null,
      config: {
        factorWeights: input.factorWeights,
        requireDividend: input.toggles.requireDividend,
        defensiveOverlay: input.toggles.defensiveOverlay,
        useMomentum: input.toggles.useMomentum,
        maxSectorWeight: input.limits.maxSectorWeight ?? undefined,
        maxPositions: input.maxPositions ?? undefined,
        maxPositionWeight: input.maxPositionWeight ?? undefined,
      },
      isPublic: false,
    });

    revalidatePath("/strategy-lab");
    revalidatePath("/backtest");

    // Audit-trail: strategy-config-mutaties zijn relevant voor compliance
    // en debugging (gebruiker rapporteert "mijn factor-weights klopten niet").
    await audit.record({
      userEmail: auth.user.email,
      category: "policy",
      action: "strategy_preset_save",
      resourceType: "StrategyPreset",
      resourceId: saved.id,
      summary: `Strategy-preset "${saved.name}" opgeslagen`,
      metadata: {
        slug: saved.slug,
        maxPositions: saved.maxPositions ?? null,
        maxPositionWeight: saved.maxPositionWeight ?? null,
      },
    });

    return {
      ok: true,
      message: `Preset "${saved.name}" opgeslagen.`,
      preset: saved,
    };
  } catch (error) {
    // Sanitized client-response (Module 15-pattern).
    log.error("strategy-lab:save", "preset save failed", {
      rawMessage: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : "non-error",
    });
    return {
      ok: false,
      message: "Opslaan mislukt door een interne fout. Probeer het opnieuw.",
    };
  }
}

export async function deletePreset(
  id: string,
): Promise<{ ok: boolean; message: string }> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, message: auth.error };

  const result = await strategyPresetRepository.deleteById(id, auth.user.email);
  if (result.ok) {
    revalidatePath("/strategy-lab");
    await audit.record({
      userEmail: auth.user.email,
      category: "policy",
      action: "strategy_preset_delete",
      resourceType: "StrategyPreset",
      resourceId: id,
      summary: "Strategy-preset verwijderd",
    });
  }
  return {
    ok: result.ok,
    message: result.ok
      ? "Preset verwijderd."
      : (result.reason ?? "Kon preset niet verwijderen."),
  };
}

function mapRebalance(
  value: SavePresetActionInput["rebalance"],
):
  | "NONE"
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMIANNUAL"
  | "ANNUAL" {
  switch (value) {
    case "none":
      return "NONE";
    case "quarterly":
      return "QUARTERLY";
    case "semiannual":
      return "SEMIANNUAL";
    case "annual":
      return "ANNUAL";
    case "monthly":
    default:
      return "MONTHLY";
  }
}
