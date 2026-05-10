"use server";

import { revalidatePath } from "next/cache";

import { resolveUserFromServer } from "@/lib/auth";
import { goalRepository, portfolioRepository } from "@/lib/data";
import type { Currency } from "@/types/common";
import type { RiskTolerance } from "@/types/profile";

import type { GoalType } from "./types";
import { DEFAULT_EXPECTED_RETURN } from "./types";

/**
 * Server actions voor financiële doelen.
 *
 * Voorbeeld-flow vanuit een client-form:
 *
 *   const result = await createGoalAction({ ... });
 *   if (!result.ok) showError(result.error);
 */

export interface ActionResult {
  ok: boolean;
  goalId?: string;
  error?: string;
}

export interface CreateGoalActionInput {
  type: GoalType;
  name: string;
  targetAmount: number;
  targetDate: string; // ISO yyyy-mm-dd
  monthlyContribution: number;
  currentAmount: number;
  expectedAnnualReturn: number;
  riskProfile: RiskTolerance;
  baseCurrency: Currency;
  description?: string | null;
}

export async function createGoalAction(
  input: CreateGoalActionInput,
): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, error: "Geen user-context" };

  const validation = validate(input);
  if (validation) return { ok: false, error: validation };

  const goal = await goalRepository.create({
    userId: ctx.userId,
    type: input.type,
    name: input.name.trim(),
    targetAmount: input.targetAmount,
    targetDate: new Date(input.targetDate),
    monthlyContribution: input.monthlyContribution,
    currentAmount: input.currentAmount,
    expectedAnnualReturn:
      input.expectedAnnualReturn ?? DEFAULT_EXPECTED_RETURN[input.riskProfile],
    riskProfile: input.riskProfile,
    baseCurrency: input.baseCurrency,
    description: input.description ?? null,
  });

  revalidatePath("/dashboard");
  revalidatePath("/doelen");
  return { ok: true, goalId: goal.id };
}

export interface UpdateGoalActionInput
  extends Partial<CreateGoalActionInput> {
  goalId: string;
}

export async function updateGoalAction(
  input: UpdateGoalActionInput,
): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, error: "Geen user-context" };

  const validation = validate(input, { partial: true });
  if (validation) return { ok: false, error: validation };

  const updated = await goalRepository.update(ctx.userId, input.goalId, {
    name: input.name?.trim(),
    targetAmount: input.targetAmount,
    targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
    monthlyContribution: input.monthlyContribution,
    currentAmount: input.currentAmount,
    expectedAnnualReturn: input.expectedAnnualReturn,
    riskProfile: input.riskProfile,
    description: input.description ?? undefined,
  });
  if (!updated) return { ok: false, error: "Doel niet gevonden" };

  revalidatePath("/dashboard");
  revalidatePath("/doelen");
  revalidatePath(`/doelen/${input.goalId}`);
  return { ok: true, goalId: updated.id };
}

export async function deleteGoalAction(input: {
  goalId: string;
}): Promise<ActionResult> {
  const auth = await resolveUserFromServer();
  if (!auth.ok) return { ok: false, error: "Niet ingelogd" };
  const ctx = await portfolioRepository
    .findUserContextByEmail(auth.user.email)
    .catch(() => null);
  if (!ctx?.userId) return { ok: false, error: "Geen user-context" };

  const ok = await goalRepository.softDelete(ctx.userId, input.goalId);
  if (!ok) return { ok: false, error: "Doel niet gevonden" };

  revalidatePath("/dashboard");
  revalidatePath("/doelen");
  return { ok: true };
}

// ============================================================
//  Validatie
// ============================================================

function validate(
  input: Partial<CreateGoalActionInput>,
  opts: { partial?: boolean } = {},
): string | null {
  const partial = opts.partial === true;

  if (!partial || input.name !== undefined) {
    if (!input.name || input.name.trim().length === 0) {
      return "Naam is verplicht";
    }
    if (input.name.length > 200) return "Naam te lang";
  }
  if (!partial || input.targetAmount !== undefined) {
    if (
      typeof input.targetAmount !== "number" ||
      !Number.isFinite(input.targetAmount) ||
      input.targetAmount <= 0
    ) {
      return "Doelbedrag moet positief zijn";
    }
  }
  if (!partial || input.targetDate !== undefined) {
    if (!input.targetDate) return "Streefdatum is verplicht";
    const dt = new Date(input.targetDate);
    if (Number.isNaN(dt.getTime())) return "Streefdatum is ongeldig";
    if (dt.getTime() < Date.now() - 86_400_000) {
      return "Streefdatum moet in de toekomst liggen";
    }
  }
  if (input.monthlyContribution !== undefined) {
    if (
      !Number.isFinite(input.monthlyContribution) ||
      input.monthlyContribution < 0
    ) {
      return "Maandelijkse inleg moet ≥ 0 zijn";
    }
  }
  if (input.currentAmount !== undefined) {
    if (!Number.isFinite(input.currentAmount) || input.currentAmount < 0) {
      return "Huidige stand moet ≥ 0 zijn";
    }
  }
  if (input.expectedAnnualReturn !== undefined) {
    if (
      !Number.isFinite(input.expectedAnnualReturn) ||
      input.expectedAnnualReturn < -0.1 ||
      input.expectedAnnualReturn > 0.5
    ) {
      return "Verwacht rendement moet tussen -10% en 50% liggen";
    }
  }
  return null;
}
