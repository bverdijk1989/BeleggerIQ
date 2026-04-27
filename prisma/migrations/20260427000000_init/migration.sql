-- CreateEnum
CREATE TYPE "InvestorType" AS ENUM ('LONG_TERM', 'INCOME', 'GROWTH', 'DIVIDEND', 'FACTOR', 'BALANCED');

-- CreateEnum
CREATE TYPE "InvestmentObjective" AS ENUM ('GROWTH', 'INCOME', 'BALANCED', 'CAPITAL_PRESERVATION', 'RETIREMENT', 'FIRE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RiskTolerance" AS ENUM ('CONSERVATIVE', 'BALANCED', 'GROWTH', 'AGGRESSIVE');

-- CreateEnum
CREATE TYPE "AssetClass" AS ENUM ('EQUITY', 'ETF', 'BOND', 'REIT', 'COMMODITY', 'CRYPTO', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "RegimeLabel" AS ENUM ('EXPANSION', 'SLOWDOWN', 'RECESSION', 'RECOVERY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "StrategyType" AS ENUM ('FACTOR', 'DIVIDEND', 'QUALITY', 'MOMENTUM', 'LOW_VOL', 'CORE', 'THEMATIC', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RebalanceFrequency" AS ENUM ('NONE', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "BacktestStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HealthGrade" AS ENUM ('A', 'B', 'C', 'D', 'F');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('SUGGESTED', 'MARKED_DONE', 'IGNORED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DecisionActionType" AS ENUM ('RISK_REDUCTION', 'BUY_OPPORTUNITY', 'HOLD_CASH', 'DO_NOTHING');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "investorType" "InvestorType" NOT NULL DEFAULT 'LONG_TERM',
    "objective" "InvestmentObjective" NOT NULL DEFAULT 'BALANCED',
    "riskTolerance" "RiskTolerance" NOT NULL DEFAULT 'BALANCED',
    "investmentHorizonYrs" INTEGER NOT NULL DEFAULT 10,
    "monthlyContribution" DECIMAL(14,2),
    "baseCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "taxResidency" TEXT NOT NULL DEFAULT 'NL',
    "goals" JSONB,
    "preferences" JSONB,
    "policy" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holding" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "isin" TEXT,
    "name" TEXT NOT NULL,
    "assetClass" "AssetClass" NOT NULL DEFAULT 'EQUITY',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "quantity" DECIMAL(20,8) NOT NULL,
    "avgCostPrice" DECIMAL(20,8) NOT NULL,
    "currentPrice" DECIMAL(20,8),
    "sector" TEXT,
    "region" TEXT,
    "beta" DECIMAL(10,4),
    "volatility" DECIMAL(10,6),
    "moatLikeScore" DECIMAL(5,4),
    "targetWeight" DECIMAL(5,4),
    "convictionScore" DECIMAL(5,4),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioSnapshot" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalValue" DECIMAL(20,2) NOT NULL,
    "totalCost" DECIMAL(20,2) NOT NULL,
    "cashBalance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "unrealizedPnl" DECIMAL(20,2),
    "unrealizedPnlPct" DECIMAL(10,6),
    "volatility" DECIMAL(10,6),
    "drawdown" DECIMAL(10,6),
    "regimeLabel" "RegimeLabel",
    "healthGrade" "HealthGrade",
    "healthScore" DECIMAL(5,2),
    "metrics" JSONB,

    CONSTRAINT "PortfolioSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSnapshot" (
    "id" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "regimeLabel" "RegimeLabel" NOT NULL DEFAULT 'UNKNOWN',
    "regimeConfidence" DECIMAL(5,4),
    "volatilityIndex" DECIMAL(10,4),
    "interestRate10y" DECIMAL(6,4),
    "inflationYoy" DECIMAL(6,4),
    "breadthScore" DECIMAL(5,4),
    "indicators" JSONB,
    "narrative" TEXT,
    "source" TEXT,

    CONSTRAINT "MarketSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FactorSnapshot" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "isin" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model" TEXT NOT NULL DEFAULT 'default',
    "valueScore" DECIMAL(6,4),
    "qualityScore" DECIMAL(6,4),
    "momentumScore" DECIMAL(6,4),
    "lowVolScore" DECIMAL(6,4),
    "growthScore" DECIMAL(6,4),
    "dividendScore" DECIMAL(6,4),
    "sizeScore" DECIMAL(6,4),
    "composite" DECIMAL(6,4),
    "percentile" DECIMAL(5,4),
    "confidence" DECIMAL(5,4),
    "fundamentals" JSONB,
    "source" TEXT,

    CONSTRAINT "FactorSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyPreset" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "StrategyType" NOT NULL DEFAULT 'FACTOR',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT,
    "rebalance" "RebalanceFrequency" NOT NULL DEFAULT 'MONTHLY',
    "maxPositions" INTEGER,
    "maxPositionWeight" DECIMAL(5,4),
    "minMarketCap" DECIMAL(20,2),
    "factorWeights" JSONB NOT NULL,
    "universeFilter" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BacktestStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "strategyId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "initialCapital" DECIMAL(20,2) NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "totalReturn" DECIMAL(10,6),
    "cagr" DECIMAL(10,6),
    "volatility" DECIMAL(10,6),
    "sharpe" DECIMAL(10,4),
    "sortino" DECIMAL(10,4),
    "maxDrawdown" DECIMAL(10,6),
    "calmar" DECIMAL(10,4),
    "winRate" DECIMAL(5,4),
    "turnover" DECIMAL(10,6),
    "finalValue" DECIMAL(20,2),
    "tradesCount" INTEGER,
    "config" JSONB NOT NULL,
    "equityCurve" JSONB,
    "benchmark" JSONB,
    "regimeBreakdown" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "note" TEXT,
    "targetPrice" DECIMAL(20,8),
    "targetPriceHigh" DECIMAL(20,8),
    "buyZoneTolerance" DOUBLE PRECISION,
    "valuationMaxPE" DOUBLE PRECISION,
    "valuationMinFcfYield" DOUBLE PRECISION,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HuntingSignalLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "watchlistItemId" TEXT,
    "ticker" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "price" DECIMAL(20,8),
    "currency" TEXT,
    "pe" DOUBLE PRECISION,
    "fcfYield" DOUBLE PRECISION,
    "rationale" TEXT,
    "note" TEXT,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HuntingSignalLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "portfolioId" TEXT,
    "decisionKey" TEXT NOT NULL,
    "suggestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suggestedBucket" TIMESTAMP(3) NOT NULL,
    "actionType" "DecisionActionType" NOT NULL,
    "symbol" TEXT,
    "shares" INTEGER,
    "amount" DECIMAL(20,2),
    "baseCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "title" TEXT NOT NULL,
    "rationale" TEXT,
    "confidence" DECIMAL(5,4) NOT NULL,
    "sourceEngine" TEXT NOT NULL,
    "status" "DecisionStatus" NOT NULL DEFAULT 'SUGGESTED',
    "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statusNote" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "Portfolio_userId_idx" ON "Portfolio"("userId");

-- CreateIndex
CREATE INDEX "Portfolio_userId_isPrimary_idx" ON "Portfolio"("userId", "isPrimary");

-- CreateIndex
CREATE INDEX "Holding_portfolioId_idx" ON "Holding"("portfolioId");

-- CreateIndex
CREATE INDEX "Holding_ticker_idx" ON "Holding"("ticker");

-- CreateIndex
CREATE INDEX "Holding_isin_idx" ON "Holding"("isin");

-- CreateIndex
CREATE UNIQUE INDEX "Holding_portfolioId_ticker_key" ON "Holding"("portfolioId", "ticker");

-- CreateIndex
CREATE INDEX "PortfolioSnapshot_portfolioId_capturedAt_idx" ON "PortfolioSnapshot"("portfolioId", "capturedAt");

-- CreateIndex
CREATE INDEX "MarketSnapshot_capturedAt_idx" ON "MarketSnapshot"("capturedAt");

-- CreateIndex
CREATE INDEX "MarketSnapshot_regimeLabel_capturedAt_idx" ON "MarketSnapshot"("regimeLabel", "capturedAt");

-- CreateIndex
CREATE INDEX "FactorSnapshot_ticker_capturedAt_idx" ON "FactorSnapshot"("ticker", "capturedAt");

-- CreateIndex
CREATE INDEX "FactorSnapshot_capturedAt_idx" ON "FactorSnapshot"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FactorSnapshot_ticker_capturedAt_model_key" ON "FactorSnapshot"("ticker", "capturedAt", "model");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyPreset_slug_key" ON "StrategyPreset"("slug");

-- CreateIndex
CREATE INDEX "StrategyPreset_ownerId_idx" ON "StrategyPreset"("ownerId");

-- CreateIndex
CREATE INDEX "StrategyPreset_isPublic_type_idx" ON "StrategyPreset"("isPublic", "type");

-- CreateIndex
CREATE INDEX "BacktestRun_userId_startedAt_idx" ON "BacktestRun"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "BacktestRun_strategyId_idx" ON "BacktestRun"("strategyId");

-- CreateIndex
CREATE INDEX "BacktestRun_portfolioId_idx" ON "BacktestRun"("portfolioId");

-- CreateIndex
CREATE INDEX "BacktestRun_status_idx" ON "BacktestRun"("status");

-- CreateIndex
CREATE INDEX "WatchlistItem_userId_addedAt_idx" ON "WatchlistItem"("userId", "addedAt");

-- CreateIndex
CREATE INDEX "WatchlistItem_ticker_idx" ON "WatchlistItem"("ticker");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_ticker_key" ON "WatchlistItem"("userId", "ticker");

-- CreateIndex
CREATE INDEX "HuntingSignalLog_userId_ticker_firedAt_idx" ON "HuntingSignalLog"("userId", "ticker", "firedAt");

-- CreateIndex
CREATE INDEX "HuntingSignalLog_userId_firedAt_idx" ON "HuntingSignalLog"("userId", "firedAt");

-- CreateIndex
CREATE INDEX "HuntingSignalLog_expiresAt_idx" ON "HuntingSignalLog"("expiresAt");

-- CreateIndex
CREATE INDEX "DecisionSnapshot_userId_suggestedAt_idx" ON "DecisionSnapshot"("userId", "suggestedAt");

-- CreateIndex
CREATE INDEX "DecisionSnapshot_userId_status_idx" ON "DecisionSnapshot"("userId", "status");

-- CreateIndex
CREATE INDEX "DecisionSnapshot_expiresAt_idx" ON "DecisionSnapshot"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DecisionSnapshot_userId_suggestedBucket_decisionKey_key" ON "DecisionSnapshot"("userId", "suggestedBucket", "decisionKey");

-- CreateIndex
CREATE INDEX "MagicLinkToken_email_createdAt_idx" ON "MagicLinkToken"("email", "createdAt");

-- CreateIndex
CREATE INDEX "MagicLinkToken_email_expiresAt_idx" ON "MagicLinkToken"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "MagicLinkToken_expiresAt_idx" ON "MagicLinkToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_email_tokenHash_key" ON "MagicLinkToken"("email", "tokenHash");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPreset" ADD CONSTRAINT "StrategyPreset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestRun" ADD CONSTRAINT "BacktestRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestRun" ADD CONSTRAINT "BacktestRun_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestRun" ADD CONSTRAINT "BacktestRun_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "StrategyPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HuntingSignalLog" ADD CONSTRAINT "HuntingSignalLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HuntingSignalLog" ADD CONSTRAINT "HuntingSignalLog_watchlistItemId_fkey" FOREIGN KEY ("watchlistItemId") REFERENCES "WatchlistItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionSnapshot" ADD CONSTRAINT "DecisionSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionSnapshot" ADD CONSTRAINT "DecisionSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

