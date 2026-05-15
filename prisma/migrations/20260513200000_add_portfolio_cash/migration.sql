-- Module 19: cash-balance per portfolio (denormalized).
-- Bestaande PortfolioSnapshot.cashBalance blijft de historische bron;
-- deze kolom houdt actuele state vast voor snelle reads.

ALTER TABLE "Portfolio" ADD COLUMN "cashBalance" DECIMAL(20,2) NOT NULL DEFAULT 0;
