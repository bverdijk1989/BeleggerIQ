import { Prisma } from "@prisma/client";

import { prisma } from "./prisma";
import type { Holding, Portfolio } from "@/types/portfolio";
import type {
  InvestmentObjective,
  PolicySettings,
  UserProfile,
} from "@/types/profile";
import type { HoldingDraft } from "@/lib/parsers/degiro";

/**
 * Repository-laag voor portefeuilles. Isoleert ORM-details van de UI en de
 * analytics engines. Breid uit met writes zodra de schrijfflows landen.
 */

const portfolioWithHoldings = Prisma.validator<Prisma.PortfolioDefaultArgs>()({
  include: { holdings: true },
});

type PortfolioWithHoldings = Prisma.PortfolioGetPayload<
  typeof portfolioWithHoldings
>;
type HoldingRow = PortfolioWithHoldings["holdings"][number];

export const portfolioRepository = {
  async findByUserId(userId: string): Promise<Portfolio[]> {
    const rows = await prisma.portfolio.findMany({
      where: { userId },
      ...portfolioWithHoldings,
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    return rows.map(mapPortfolio);
  },

  async findPrimary(userId: string): Promise<Portfolio | null> {
    const row = await prisma.portfolio.findFirst({
      where: { userId, isPrimary: true },
      ...portfolioWithHoldings,
    });

    return row ? mapPortfolio(row) : null;
  },

  /**
   * Temporary helper zolang auth nog niet is aangesloten. Verwacht dat
   * `email` een bekende user identificeert en geeft diens primary
   * portfolio terug — of de eerst gevonden portfolio als er geen primary is.
   */
  async findPrimaryByEmail(email: string): Promise<Portfolio | null> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        portfolios: {
          ...portfolioWithHoldings,
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
        },
      },
    });
    const row = user?.portfolios[0];
    return row ? mapPortfolio(row) : null;
  },

  /**
   * Eén-call helper die user + primary portfolio + profile ophaalt. Handig
   * voor server components die zowel policy/objective als portefeuille nodig
   * hebben (bv. de monthly buy engine).
   */
  async findUserContextByEmail(email: string): Promise<{
    userId: string;
    portfolio: Portfolio | null;
    profile: UserProfile | null;
    monthlyContribution: number | null;
  } | null> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
        portfolios: {
          ...portfolioWithHoldings,
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
        },
      },
    });
    if (!user) return null;
    const portfolio = user.portfolios[0]
      ? mapPortfolio(user.portfolios[0])
      : null;
    const profile = user.profile ? mapProfile(user.profile) : null;
    const monthlyContribution = user.profile?.monthlyContribution
      ? Number(user.profile.monthlyContribution)
      : null;
    return { userId: user.id, portfolio, profile, monthlyContribution };
  },

  /**
   * Zoek de email van de eigenaar van een portfolio. Wordt gebruikt door de
   * API routes om authorization te checken (mag deze sessie-user deze
   * portfolioId aanraken?). Retourneert `null` als de portfolio niet bestaat.
   */
  async findOwnerEmailById(portfolioId: string): Promise<string | null> {
    const row = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
      select: { user: { select: { email: true } } },
    });
    return row?.user.email ?? null;
  },

  /**
   * Upsert een batch holdings op (portfolioId, ticker). Bestaande posities
   * worden overschreven met de nieuwe quantity, kostprijs en koers — dit is
   * bewust omdat DEGIRO portefeuille-exports de volledige huidige stand bevatten.
   *
   * Retourneert een telling per actie voor UI feedback.
   */
  async upsertHoldings(
    portfolioId: string,
    drafts: HoldingDraft[],
  ): Promise<{ created: number; updated: number }> {
    if (drafts.length === 0) return { created: 0, updated: 0 };

    const portfolio = await prisma.portfolio.findUnique({
      where: { id: portfolioId },
      select: { id: true },
    });
    if (!portfolio) {
      throw new Error(`Portfolio ${portfolioId} bestaat niet.`);
    }

    const existingTickers = new Set(
      (
        await prisma.holding.findMany({
          where: { portfolioId, ticker: { in: drafts.map((d) => d.ticker) } },
          select: { ticker: true },
        })
      ).map((h) => h.ticker),
    );

    await prisma.$transaction(
      drafts.map((d) =>
        prisma.holding.upsert({
          where: { portfolioId_ticker: { portfolioId, ticker: d.ticker } },
          create: {
            portfolioId,
            ticker: d.ticker,
            isin: d.isin ?? null,
            name: d.name,
            assetClass: d.assetClass,
            currency: d.currency,
            quantity: d.quantity,
            avgCostPrice: d.avgCostPrice,
            currentPrice: d.currentPrice ?? null,
            sector: d.sector ?? null,
            region: d.region ?? null,
          },
          update: {
            name: d.name,
            assetClass: d.assetClass,
            currency: d.currency,
            quantity: d.quantity,
            avgCostPrice: d.avgCostPrice,
            currentPrice: d.currentPrice ?? null,
            isin: d.isin ?? undefined,
            sector: d.sector ?? undefined,
            region: d.region ?? undefined,
          },
        }),
      ),
    );

    let updated = 0;
    let created = 0;
    for (const draft of drafts) {
      if (existingTickers.has(draft.ticker)) updated++;
      else created++;
    }
    return { created, updated };
  },

  /**
   * Update de cash-balans van een portfolio. Geen historie — gebruik
   * `PortfolioSnapshot` voor tijdsreeks. Module 19.
   */
  async updateCashBalance(
    portfolioId: string,
    cashBalance: number,
  ): Promise<void> {
    await prisma.portfolio.update({
      where: { id: portfolioId },
      data: { cashBalance },
    });
  },
};

function mapPortfolio(row: PortfolioWithHoldings): Portfolio {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    baseCurrency: row.baseCurrency as Portfolio["baseCurrency"],
    isPrimary: row.isPrimary,
    cashBalance: Number(row.cashBalance ?? 0),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    holdings: row.holdings.map(mapHolding),
  };
}

type ProfileRow = NonNullable<
  Awaited<ReturnType<typeof prisma.userProfile.findUnique>>
>;

function mapProfile(row: ProfileRow): UserProfile {
  const goalsJson = row.goals;
  const preferencesJson = row.preferences;
  const policyJson = row.policy;

  return {
    id: row.id,
    userId: row.userId,
    investorType: row.investorType as UserProfile["investorType"],
    objective: row.objective as InvestmentObjective,
    riskTolerance: row.riskTolerance as UserProfile["riskTolerance"],
    investmentHorizonYrs: row.investmentHorizonYrs,
    monthlyContribution:
      row.monthlyContribution !== null
        ? Number(row.monthlyContribution)
        : null,
    baseCurrency: row.baseCurrency as UserProfile["baseCurrency"],
    taxResidency: row.taxResidency,
    goals: Array.isArray(goalsJson)
      ? (goalsJson as unknown as UserProfile["goals"])
      : [],
    preferences:
      preferencesJson && typeof preferencesJson === "object" && !Array.isArray(preferencesJson)
        ? (preferencesJson as Record<string, unknown>)
        : {},
    policy:
      policyJson && typeof policyJson === "object" && !Array.isArray(policyJson)
        ? (policyJson as PolicySettings)
        : undefined,
    uxMode: row.uxMode as UserProfile["uxMode"],
    billingTier: row.billingTier as UserProfile["billingTier"],
  };
}

function mapHolding(row: HoldingRow): Holding {
  return {
    id: row.id,
    portfolioId: row.portfolioId,
    ticker: row.ticker,
    isin: row.isin,
    name: row.name,
    assetClass: row.assetClass as Holding["assetClass"],
    currency: row.currency as Holding["currency"],
    quantity: Number(row.quantity),
    avgCostPrice: Number(row.avgCostPrice),
    currentPrice: decimalOrUndefinedNullable(row.currentPrice),
    sector: row.sector,
    region: row.region,
    beta: decimalOrUndefined(row.beta),
    volatility: decimalOrUndefined(row.volatility),
    moatLikeScore: decimalOrUndefined(row.moatLikeScore),
    targetWeight: decimalOrUndefined(row.targetWeight),
    convictionScore: decimalOrUndefined(row.convictionScore),
    metadata: row.metadata as Holding["metadata"],
  };
}

/** Decimal → number voor optionele velden; undefined als de kolom null is. */
function decimalOrUndefined(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

/** Variant die null behoudt (currentPrice is nullable in het domeintype). */
function decimalOrUndefinedNullable(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
