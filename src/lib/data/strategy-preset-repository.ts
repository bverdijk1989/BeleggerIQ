import { Prisma, type StrategyType, type RebalanceFrequency } from "@prisma/client";

import type {
  CustomStrategyConfig,
  CustomStrategyWeights,
} from "@/lib/analytics/backtest";
import { toFiniteNumber } from "@/lib/http/validate";

import { prisma } from "./prisma";

/**
 * Repository voor `StrategyPreset`. Wraps Prisma-rows in domeinshape voor
 * UI en Strategy Lab. Owned vs public presets zijn beide leesbaar;
 * alleen eigen presets kunnen worden bewerkt of verwijderd.
 *
 * Serialisatie:
 *  - `factorWeights` Json = `{ quality, value, momentum, lowVol }` (4 kerngetallen).
 *  - `universeFilter` Json = `{ toggles: { requireDividend, defensiveOverlay, useMomentum },
 *    limits: { maxSectorWeight } }` — alles wat niet in een dedicated kolom past.
 */

export interface StrategyPresetRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: StrategyType;
  tags: string[];
  isPublic: boolean;
  ownerId: string | null;
  rebalance: RebalanceFrequency;
  maxPositions: number | null;
  maxPositionWeight: number | null;
  minMarketCap: number | null;
  createdAt: string;
  updatedAt: string;
  /** Canonical 4-way factor weights. */
  factorWeights: CustomStrategyWeights;
  /** Toggles + extra limits die niet in aparte kolommen staan. */
  extras: {
    requireDividend: boolean;
    defensiveOverlay: boolean;
    useMomentum: boolean;
    maxSectorWeight: number | null;
  };
}

export interface SavePresetInput {
  name: string;
  description?: string;
  slug?: string;
  type?: StrategyType;
  tags?: string[];
  ownerEmail: string | null;
  isPublic?: boolean;
  rebalance?: RebalanceFrequency;
  maxPositions?: number | null;
  maxPositionWeight?: number | null;
  config: CustomStrategyConfig;
}

export const strategyPresetRepository = {
  async listForUserEmail(email: string | null): Promise<StrategyPresetRow[]> {
    const rows = await prisma.strategyPreset.findMany({
      where: email
        ? {
            OR: [{ isPublic: true }, { owner: { email } }],
          }
        : { isPublic: true },
      orderBy: [{ isPublic: "desc" }, { updatedAt: "desc" }],
    });
    return rows.map(mapRow);
  },

  async findBySlug(slug: string): Promise<StrategyPresetRow | null> {
    const row = await prisma.strategyPreset.findUnique({ where: { slug } });
    return row ? mapRow(row) : null;
  },

  async save(input: SavePresetInput): Promise<StrategyPresetRow> {
    const { owner, slug } = await resolveOwnerAndSlug(input);
    const data = buildPrismaWrite(input, slug, owner?.id ?? null);
    const upserted = await prisma.strategyPreset.upsert({
      where: { slug },
      create: data,
      update: data,
    });
    return mapRow(upserted);
  },

  async deleteById(
    id: string,
    ownerEmail: string | null,
  ): Promise<{ ok: boolean; reason?: string }> {
    const row = await prisma.strategyPreset.findUnique({
      where: { id },
      include: { owner: { select: { email: true } } },
    });
    if (!row) return { ok: false, reason: "Preset niet gevonden." };
    if (row.isPublic) return { ok: false, reason: "Publieke presets kunnen niet verwijderd worden." };
    if (ownerEmail === null || row.owner?.email !== ownerEmail) {
      return { ok: false, reason: "Alleen de eigenaar kan deze preset verwijderen." };
    }
    await prisma.strategyPreset.delete({ where: { id } });
    return { ok: true };
  },
};

// ============================================================
//  Internals
// ============================================================

type PrismaRow = Awaited<
  ReturnType<typeof prisma.strategyPreset.findUnique>
>;

function mapRow(row: NonNullable<PrismaRow>): StrategyPresetRow {
  const factorWeights = parseFactorWeights(row.factorWeights);
  const extras = parseExtras(row.universeFilter);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    type: row.type,
    tags: row.tags,
    isPublic: row.isPublic,
    ownerId: row.ownerId,
    rebalance: row.rebalance,
    maxPositions: row.maxPositions,
    maxPositionWeight:
      row.maxPositionWeight !== null ? Number(row.maxPositionWeight) : null,
    minMarketCap:
      row.minMarketCap !== null ? Number(row.minMarketCap) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    factorWeights,
    extras,
  };
}

function parseFactorWeights(raw: unknown): CustomStrategyWeights {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      quality: toFiniteNumber(obj.quality) ?? 0.25,
      value: toFiniteNumber(obj.value) ?? 0.25,
      momentum: toFiniteNumber(obj.momentum) ?? 0.25,
      lowVol: toFiniteNumber(obj.lowVol) ?? 0.25,
    };
  }
  return { quality: 0.25, value: 0.25, momentum: 0.25, lowVol: 0.25 };
}

function parseExtras(raw: unknown): StrategyPresetRow["extras"] {
  const fallback = {
    requireDividend: false,
    defensiveOverlay: false,
    useMomentum: true,
    maxSectorWeight: null as number | null,
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return fallback;
  const obj = raw as Record<string, unknown>;
  const toggles =
    obj.toggles && typeof obj.toggles === "object"
      ? (obj.toggles as Record<string, unknown>)
      : {};
  const limits =
    obj.limits && typeof obj.limits === "object"
      ? (obj.limits as Record<string, unknown>)
      : {};
  return {
    requireDividend: Boolean(toggles.requireDividend),
    defensiveOverlay: Boolean(toggles.defensiveOverlay),
    useMomentum: toggles.useMomentum === undefined ? true : Boolean(toggles.useMomentum),
    maxSectorWeight: toFiniteNumber(limits.maxSectorWeight) ?? null,
  };
}

async function resolveOwnerAndSlug(
  input: SavePresetInput,
): Promise<{ owner: { id: string } | null; slug: string }> {
  const owner = input.ownerEmail
    ? await prisma.user.findUnique({
        where: { email: input.ownerEmail },
        select: { id: true },
      })
    : null;
  const slug = input.slug?.trim() || slugify(input.name);
  return { owner, slug };
}

function buildPrismaWrite(
  input: SavePresetInput,
  slug: string,
  ownerId: string | null,
): Prisma.StrategyPresetUncheckedCreateInput & Prisma.StrategyPresetUncheckedUpdateInput {
  const factorWeights = input.config.factorWeights;
  const universeFilter = {
    toggles: {
      requireDividend: Boolean(input.config.requireDividend),
      defensiveOverlay: Boolean(input.config.defensiveOverlay),
      useMomentum: input.config.useMomentum ?? true,
    },
    limits: {
      maxSectorWeight: input.config.maxSectorWeight ?? null,
    },
  };

  return {
    slug,
    name: input.name,
    description: input.description ?? "",
    type: input.type ?? "CUSTOM",
    tags: input.tags ?? [],
    isPublic: input.isPublic ?? false,
    ownerId,
    rebalance: input.rebalance ?? "MONTHLY",
    maxPositions:
      input.maxPositions ?? input.config.maxPositions ?? null,
    maxPositionWeight:
      (input.maxPositionWeight ??
        input.config.maxPositionWeight ??
        null) as number | null,
    factorWeights: factorWeights as unknown as Prisma.InputJsonValue,
    universeFilter: universeFilter as unknown as Prisma.InputJsonValue,
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function presetToCustomConfig(
  row: StrategyPresetRow,
): CustomStrategyConfig {
  return {
    factorWeights: row.factorWeights,
    requireDividend: row.extras.requireDividend,
    defensiveOverlay: row.extras.defensiveOverlay,
    useMomentum: row.extras.useMomentum,
    maxPositions: row.maxPositions ?? undefined,
    maxPositionWeight: row.maxPositionWeight ?? undefined,
    maxSectorWeight: row.extras.maxSectorWeight ?? undefined,
  };
}
