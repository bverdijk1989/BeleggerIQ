/**
 * Seed-script voor BeleggerIQ 2.0.
 *
 * Idempotent: draai meerdere keren zonder duplicaten door consequent
 * `upsert` te gebruiken op unieke sleutels (email, slug, composite keys).
 *
 * Uitvoeren: `npm run prisma:seed` (of automatisch via `prisma migrate reset`).
 */

import {
  AssetClass,
  BacktestStatus,
  HealthGrade,
  InvestorType,
  InvestmentObjective,
  PrismaClient,
  RebalanceFrequency,
  RegimeLabel,
  RiskTolerance,
  StrategyType,
} from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@beleggeriq.nl";

async function main(): Promise<void> {
  console.log("Seeding BeleggerIQ...");

  const user = await seedDemoUser();
  const portfolio = await seedDemoPortfolio(user.id);
  await seedPortfolioSnapshot(portfolio.id);
  await seedWatchlist(user.id);
  await seedStrategyPresets();
  await seedMarketSnapshots();
  await seedFactorSnapshots();
  await seedBacktestRun(user.id, portfolio.id);

  console.log("Seed voltooid.");
}

async function seedDemoUser() {
  return prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      name: "Demo Belegger",
      profile: {
        create: {
          investorType: InvestorType.LONG_TERM,
          objective: InvestmentObjective.BALANCED,
          riskTolerance: RiskTolerance.BALANCED,
          investmentHorizonYrs: 15,
          monthlyContribution: 500,
          baseCurrency: "EUR",
          taxResidency: "NL",
          goals: [
            {
              id: "retirement",
              label: "Pensioenkapitaal",
              targetAmount: 500000,
              targetDate: "2045-01-01",
            },
          ],
          preferences: { showSectorConcentration: true },
          policy: {
            maxPositionWeight: 0.1,
            maxSectorWeight: 0.35,
            maxRegionWeight: 0.65,
            maxPositions: 25,
            minPositions: 8,
            allowedAssetClasses: ["EQUITY", "ETF"],
            cashBufferPct: 0.05,
            rebalance: "monthly",
            minFactorComposite: -0.1,
          },
        },
      },
    },
  });
}

async function seedDemoPortfolio(userId: string) {
  const portfolio = await prisma.portfolio.upsert({
    where: { id: "seed-portfolio-core" },
    update: {},
    create: {
      id: "seed-portfolio-core",
      userId,
      name: "Core Kwaliteit",
      description: "Kwaliteitsbedrijven met een langetermijnhorizon.",
      baseCurrency: "EUR",
      isPrimary: true,
    },
  });

  // Holdings via composite unique upsert zodat seed-herhaling veilig is.
  const holdings: Array<{
    ticker: string;
    name: string;
    assetClass: AssetClass;
    currency: string;
    quantity: number;
    avgCostPrice: number;
    currentPrice: number;
    sector: string;
    region: string;
    targetWeight?: number;
    moatLikeScore?: number;
    convictionScore?: number;
  }> = [
    {
      ticker: "ASML",
      name: "ASML Holding",
      assetClass: AssetClass.EQUITY,
      currency: "EUR",
      quantity: 5,
      avgCostPrice: 500,
      currentPrice: 720,
      sector: "Technology",
      region: "Europe",
      targetWeight: 0.1,
      moatLikeScore: 0.82,
      convictionScore: 0.8,
    },
    {
      ticker: "MSFT",
      name: "Microsoft",
      assetClass: AssetClass.EQUITY,
      currency: "USD",
      quantity: 10,
      avgCostPrice: 250,
      currentPrice: 410,
      sector: "Technology",
      region: "North America",
      targetWeight: 0.1,
      moatLikeScore: 0.88,
      convictionScore: 0.85,
    },
    {
      ticker: "SHEL",
      name: "Shell plc",
      assetClass: AssetClass.EQUITY,
      currency: "EUR",
      quantity: 30,
      avgCostPrice: 25,
      currentPrice: 32,
      sector: "Energy",
      region: "Europe",
      targetWeight: 0.06,
      moatLikeScore: 0.55,
      convictionScore: 0.55,
    },
    {
      ticker: "VWCE",
      name: "Vanguard FTSE All-World UCITS ETF",
      assetClass: AssetClass.ETF,
      currency: "EUR",
      quantity: 15,
      avgCostPrice: 100,
      currentPrice: 118,
      sector: "Diversified",
      region: "Global",
      targetWeight: 0.3,
      convictionScore: 0.7,
    },
  ];

  for (const h of holdings) {
    await prisma.holding.upsert({
      where: { portfolioId_ticker: { portfolioId: portfolio.id, ticker: h.ticker } },
      update: {
        currentPrice: h.currentPrice,
        targetWeight: h.targetWeight,
        moatLikeScore: h.moatLikeScore,
        convictionScore: h.convictionScore,
      },
      create: {
        portfolioId: portfolio.id,
        ticker: h.ticker,
        name: h.name,
        assetClass: h.assetClass,
        currency: h.currency,
        quantity: h.quantity,
        avgCostPrice: h.avgCostPrice,
        currentPrice: h.currentPrice,
        sector: h.sector,
        region: h.region,
        targetWeight: h.targetWeight,
        moatLikeScore: h.moatLikeScore,
        convictionScore: h.convictionScore,
      },
    });
  }

  return portfolio;
}

async function seedPortfolioSnapshot(portfolioId: string): Promise<void> {
  // Deterministische capturedAt zodat seed idempotent blijft.
  const capturedAt = new Date("2026-04-01T00:00:00.000Z");
  const existing = await prisma.portfolioSnapshot.findFirst({
    where: { portfolioId, capturedAt },
  });
  if (existing) return;

  await prisma.portfolioSnapshot.create({
    data: {
      portfolioId,
      capturedAt,
      totalValue: 11380,
      totalCost: 9000,
      cashBalance: 250,
      unrealizedPnl: 2130,
      unrealizedPnlPct: 0.237,
      volatility: 0.14,
      drawdown: -0.06,
      regimeLabel: RegimeLabel.SLOWDOWN,
      healthGrade: HealthGrade.B,
      healthScore: 78,
      metrics: {
        concentrationHhi: 0.19,
        largestPositionWeight: 0.36,
      },
    },
  });
}

async function seedWatchlist(userId: string): Promise<void> {
  const items: Array<{ ticker: string; name: string; note?: string; targetPrice?: number }> = [
    { ticker: "NVDA", name: "Nvidia", note: "Monitor valuation t.o.v. AI cycle." },
    { ticker: "PEP", name: "PepsiCo", targetPrice: 150 },
    { ticker: "IEFA", name: "iShares Core MSCI EAFE" },
  ];

  for (const item of items) {
    await prisma.watchlistItem.upsert({
      where: { userId_ticker: { userId, ticker: item.ticker } },
      update: { name: item.name, note: item.note ?? null, targetPrice: item.targetPrice ?? null },
      create: { userId, ...item },
    });
  }
}

async function seedStrategyPresets(): Promise<void> {
  const presets = [
    {
      slug: "quality-compounders",
      name: "Quality Compounders",
      description:
        "Bedrijven met stabiele marges, hoog ROIC en lage schulden. Lange horizon, lage turnover.",
      type: StrategyType.QUALITY,
      tags: ["quality", "long-term", "compounders"],
      rebalance: RebalanceFrequency.QUARTERLY,
      maxPositions: 15,
      maxPositionWeight: 0.1,
      factorWeights: { value: 0.15, quality: 0.45, momentum: 0.25, lowVol: 0.15 },
    },
    {
      slug: "dividend-income",
      name: "Dividend Income",
      description:
        "Stabiel dividend met acceptabele payout ratio en groei. Focus op cashflow boven koersbeweging.",
      type: StrategyType.DIVIDEND,
      tags: ["dividend", "income"],
      rebalance: RebalanceFrequency.QUARTERLY,
      maxPositions: 20,
      maxPositionWeight: 0.08,
      factorWeights: {
        value: 0.2,
        quality: 0.2,
        momentum: 0.1,
        lowVol: 0.2,
        dividend: 0.3,
      },
    },
    {
      slug: "low-vol-core",
      name: "Low-Vol Core",
      description:
        "Brede spreiding rond lage-volatiliteitsnamen. Bedoeld als core-bouwsteen voor een gemengde portefeuille.",
      type: StrategyType.LOW_VOL,
      tags: ["low-vol", "core"],
      rebalance: RebalanceFrequency.SEMIANNUAL,
      maxPositions: 30,
      maxPositionWeight: 0.06,
      factorWeights: { value: 0.2, quality: 0.25, momentum: 0.1, lowVol: 0.45 },
    },
  ];

  for (const preset of presets) {
    await prisma.strategyPreset.upsert({
      where: { slug: preset.slug },
      update: {
        name: preset.name,
        description: preset.description,
        type: preset.type,
        tags: preset.tags,
        rebalance: preset.rebalance,
        maxPositions: preset.maxPositions,
        maxPositionWeight: preset.maxPositionWeight,
        factorWeights: preset.factorWeights,
        isPublic: true,
      },
      create: { ...preset, isPublic: true },
    });
  }
}

async function seedMarketSnapshots(): Promise<void> {
  const samples = [
    {
      capturedAt: new Date("2026-02-01T00:00:00.000Z"),
      regimeLabel: RegimeLabel.EXPANSION,
      regimeConfidence: 0.71,
      volatilityIndex: 15.2,
      interestRate10y: 0.029,
      inflationYoy: 0.022,
      breadthScore: 0.64,
      narrative: "Brede markt in uptrend; credit spreads tight.",
      source: "seed",
    },
    {
      capturedAt: new Date("2026-04-01T00:00:00.000Z"),
      regimeLabel: RegimeLabel.SLOWDOWN,
      regimeConfidence: 0.62,
      volatilityIndex: 18.4,
      interestRate10y: 0.028,
      inflationYoy: 0.024,
      breadthScore: 0.55,
      narrative: "Groeivertraging in Europa; arbeidsmarkt blijft krap.",
      source: "seed",
    },
  ];

  for (const sample of samples) {
    const existing = await prisma.marketSnapshot.findFirst({
      where: { capturedAt: sample.capturedAt, source: "seed" },
    });
    if (existing) continue;
    await prisma.marketSnapshot.create({ data: sample });
  }
}

async function seedFactorSnapshots(): Promise<void> {
  const capturedAt = new Date("2026-04-01T00:00:00.000Z");
  const rows = [
    { ticker: "ASML", value: -0.2, quality: 0.75, momentum: 0.35, lowVol: -0.1, composite: 0.3, percentile: 0.78 },
    { ticker: "MSFT", value: -0.15, quality: 0.85, momentum: 0.4, lowVol: 0.1, composite: 0.42, percentile: 0.88 },
    { ticker: "SHEL", value: 0.55, quality: 0.3, momentum: 0.0, lowVol: 0.2, composite: 0.28, percentile: 0.6 },
  ];

  for (const r of rows) {
    await prisma.factorSnapshot.upsert({
      where: {
        ticker_capturedAt_model: {
          ticker: r.ticker,
          capturedAt,
          model: "default",
        },
      },
      update: {
        valueScore: r.value,
        qualityScore: r.quality,
        momentumScore: r.momentum,
        lowVolScore: r.lowVol,
        composite: r.composite,
        percentile: r.percentile,
      },
      create: {
        ticker: r.ticker,
        capturedAt,
        model: "default",
        valueScore: r.value,
        qualityScore: r.quality,
        momentumScore: r.momentum,
        lowVolScore: r.lowVol,
        composite: r.composite,
        percentile: r.percentile,
        source: "seed",
      },
    });
  }
}

async function seedBacktestRun(userId: string, portfolioId: string): Promise<void> {
  const strategy = await prisma.strategyPreset.findUnique({
    where: { slug: "quality-compounders" },
  });
  if (!strategy) return;

  const existing = await prisma.backtestRun.findFirst({
    where: { userId, strategyId: strategy.id, name: "Seed backtest – Quality Compounders" },
  });
  if (existing) return;

  const config = {
    name: "Seed backtest – Quality Compounders",
    strategyPresetId: strategy.id,
    startDate: "2018-01-01",
    endDate: "2026-01-01",
    initialCapital: 10000,
    baseCurrency: "EUR",
    monthlyContribution: 500,
    rebalance: "quarterly",
    maxPositionWeight: 0.1,
    includeCosts: true,
    includeTaxes: false,
    benchmarkTicker: "IWDA",
    universe: ["ASML", "MSFT", "SHEL", "VWCE"],
    factorWeights: strategy.factorWeights,
  };

  await prisma.backtestRun.create({
    data: {
      userId,
      portfolioId,
      strategyId: strategy.id,
      name: config.name,
      status: BacktestStatus.COMPLETED,
      startDate: new Date(config.startDate),
      endDate: new Date(config.endDate),
      initialCapital: config.initialCapital,
      baseCurrency: config.baseCurrency,
      totalReturn: 0.78,
      cagr: 0.076,
      volatility: 0.14,
      sharpe: 0.82,
      maxDrawdown: -0.23,
      finalValue: 17800,
      tradesCount: 32,
      config,
      equityCurve: [
        { date: "2018-01-01", value: 10000 },
        { date: "2020-03-01", value: 7800, drawdown: -0.22 },
        { date: "2023-01-01", value: 14200 },
        { date: "2026-01-01", value: 17800 },
      ],
      benchmark: {
        ticker: "IWDA",
        totalReturn: 0.62,
        cagr: 0.063,
        volatility: 0.13,
        maxDrawdown: -0.27,
      },
      completedAt: new Date(),
    },
  });
}

main()
  .catch((error) => {
    console.error("Seed mislukt:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
