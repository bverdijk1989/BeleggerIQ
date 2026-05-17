-- Module 5: koppel financieel doel optioneel aan portefeuille.
-- Nullable + onDelete: SetNull zodat een doel niet verloren gaat als
-- de gekoppelde portefeuille verwijderd wordt.

ALTER TABLE "FinancialGoal" ADD COLUMN "portfolioId" TEXT;

ALTER TABLE "FinancialGoal" ADD CONSTRAINT "FinancialGoal_portfolioId_fkey"
  FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "FinancialGoal_portfolioId_idx" ON "FinancialGoal"("portfolioId");
