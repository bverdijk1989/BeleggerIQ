import {
  type FinancialGoal as PrismaGoal,
  type GoalType as PrismaGoalType,
  type RiskTolerance as PrismaRisk,
} from "@prisma/client";

import type { FinancialGoal, GoalType } from "@/lib/analytics/goals";
import type { Currency } from "@/types/common";
import type { RiskTolerance } from "@/types/profile";

import { prisma } from "./prisma";

/**
 * Repository voor `FinancialGoal`. Server-only.
 *
 * Conventies:
 *  - **Decimal → number** conversie hier zodat callers plain JS-getallen
 *    krijgen.
 *  - **Soft-delete** via `isActive=false`; we hard-deleten niet zodat
 *    historiek bewaard blijft voor audit.
 */

function rowToDomain(row: PrismaGoal): FinancialGoal {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as GoalType,
    name: row.name,
    targetAmount: Number(row.targetAmount),
    targetDate: row.targetDate.toISOString(),
    monthlyContribution: Number(row.monthlyContribution),
    currentAmount: Number(row.currentAmount),
    expectedAnnualReturn: Number(row.expectedAnnualReturn),
    riskProfile: row.riskProfile as RiskTolerance,
    baseCurrency: row.baseCurrency as Currency,
    description: row.description,
    portfolioId: row.portfolioId ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface CreateGoalInput {
  userId: string;
  type: GoalType;
  name: string;
  targetAmount: number;
  targetDate: Date;
  monthlyContribution: number;
  currentAmount: number;
  expectedAnnualReturn: number;
  riskProfile: RiskTolerance;
  baseCurrency: Currency;
  description?: string | null;
  /** Optionele portfolio-koppeling (Module 5). */
  portfolioId?: string | null;
}

export interface UpdateGoalInput {
  name?: string;
  targetAmount?: number;
  targetDate?: Date;
  monthlyContribution?: number;
  currentAmount?: number;
  expectedAnnualReturn?: number;
  riskProfile?: RiskTolerance;
  description?: string | null;
  portfolioId?: string | null;
  isActive?: boolean;
}

export const goalRepository = {
  async listForUser(
    userId: string,
    options: { activeOnly?: boolean } = {},
  ): Promise<FinancialGoal[]> {
    const rows = await prisma.financialGoal.findMany({
      where: {
        userId,
        ...(options.activeOnly !== false ? { isActive: true } : {}),
      },
      orderBy: [{ targetDate: "asc" }, { createdAt: "desc" }],
    });
    return rows.map(rowToDomain);
  },

  async getByIdForUser(
    userId: string,
    goalId: string,
  ): Promise<FinancialGoal | null> {
    const row = await prisma.financialGoal.findFirst({
      where: { id: goalId, userId },
    });
    return row ? rowToDomain(row) : null;
  },

  async create(input: CreateGoalInput): Promise<FinancialGoal> {
    const row = await prisma.financialGoal.create({
      data: {
        userId: input.userId,
        type: input.type as PrismaGoalType,
        name: input.name,
        targetAmount: input.targetAmount,
        targetDate: input.targetDate,
        monthlyContribution: input.monthlyContribution,
        currentAmount: input.currentAmount,
        expectedAnnualReturn: input.expectedAnnualReturn,
        riskProfile: input.riskProfile as PrismaRisk,
        baseCurrency: input.baseCurrency,
        description: input.description ?? null,
        portfolioId: input.portfolioId ?? null,
      },
    });
    return rowToDomain(row);
  },

  async update(
    userId: string,
    goalId: string,
    patch: UpdateGoalInput,
  ): Promise<FinancialGoal | null> {
    const existing = await prisma.financialGoal.findFirst({
      where: { id: goalId, userId },
    });
    if (!existing) return null;
    const row = await prisma.financialGoal.update({
      where: { id: goalId },
      data: {
        name: patch.name ?? undefined,
        targetAmount: patch.targetAmount ?? undefined,
        targetDate: patch.targetDate ?? undefined,
        monthlyContribution: patch.monthlyContribution ?? undefined,
        currentAmount: patch.currentAmount ?? undefined,
        expectedAnnualReturn: patch.expectedAnnualReturn ?? undefined,
        riskProfile: (patch.riskProfile as PrismaRisk | undefined) ?? undefined,
        description:
          patch.description === undefined ? undefined : patch.description,
        portfolioId:
          patch.portfolioId === undefined ? undefined : patch.portfolioId,
        isActive: patch.isActive ?? undefined,
      },
    });
    return rowToDomain(row);
  },

  async softDelete(userId: string, goalId: string): Promise<boolean> {
    const existing = await prisma.financialGoal.findFirst({
      where: { id: goalId, userId },
    });
    if (!existing) return false;
    await prisma.financialGoal.update({
      where: { id: goalId },
      data: { isActive: false },
    });
    return true;
  },
};
