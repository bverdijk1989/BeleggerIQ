-- CreateTable
CREATE TABLE "TaxValuation" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "peilYear" INTEGER NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "totalValue" DECIMAL(20,2) NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "source" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxValuation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxValuation_portfolioId_peilYear_key" ON "TaxValuation"("portfolioId", "peilYear");

-- CreateIndex
CREATE INDEX "TaxValuation_portfolioId_idx" ON "TaxValuation"("portfolioId");

-- AddForeignKey
ALTER TABLE "TaxValuation" ADD CONSTRAINT "TaxValuation_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
