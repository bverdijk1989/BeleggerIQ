-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'FEE', 'TAX', 'CASH', 'FX', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "ticker" TEXT,
    "isin" TEXT,
    "name" TEXT,
    "type" "TransactionType" NOT NULL,
    "quantity" DECIMAL(20,8),
    "price" DECIMAL(20,8),
    "fee" DECIMAL(20,4),
    "signedAmount" DECIMAL(20,4),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "executedAt" TIMESTAMP(3) NOT NULL,
    "externalId" TEXT,
    "source" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_portfolioId_externalId_key" ON "Transaction"("portfolioId", "externalId");

-- CreateIndex
CREATE INDEX "Transaction_portfolioId_executedAt_idx" ON "Transaction"("portfolioId", "executedAt");

-- CreateIndex
CREATE INDEX "Transaction_portfolioId_type_executedAt_idx" ON "Transaction"("portfolioId", "type", "executedAt");

-- CreateIndex
CREATE INDEX "Transaction_ticker_executedAt_idx" ON "Transaction"("ticker", "executedAt");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
