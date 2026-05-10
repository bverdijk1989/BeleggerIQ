-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('HEALTH_DROP', 'CONCENTRATION_RISING', 'PRICE_MOVE', 'MACRO_REGIME_CHANGE', 'BEHAVIORAL_WARNING', 'EARNINGS_EVENT', 'DIVIDEND_EVENT', 'WATCHLIST_OPPORTUNITY', 'VALUATION_SIGNAL', 'AI_BRIEFING_READY');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('UNREAD', 'READ', 'DISMISSED');

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
    "status" "AlertStatus" NOT NULL DEFAULT 'UNREAD',
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "context" JSONB,
    "link" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Alert_userId_dedupeKey_key" ON "Alert"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "Alert_userId_status_occurredAt_idx" ON "Alert"("userId", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "Alert_userId_type_occurredAt_idx" ON "Alert"("userId", "type", "occurredAt");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
