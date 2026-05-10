-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('RETIREMENT', 'FIRE', 'DIVIDEND_INCOME', 'WEALTH_GROWTH', 'HOME_PURCHASE', 'EDUCATION', 'EMERGENCY_FUND', 'CUSTOM');

-- CreateTable
CREATE TABLE "FinancialGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "GoalType" NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(20,2) NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "monthlyContribution" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currentAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "expectedAnnualReturn" DECIMAL(6,4) NOT NULL,
    "riskProfile" "RiskTolerance" NOT NULL DEFAULT 'BALANCED',
    "baseCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialGoal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinancialGoal_userId_isActive_idx" ON "FinancialGoal"("userId", "isActive");

-- CreateIndex
CREATE INDEX "FinancialGoal_userId_targetDate_idx" ON "FinancialGoal"("userId", "targetDate");

-- AddForeignKey
ALTER TABLE "FinancialGoal" ADD CONSTRAINT "FinancialGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
