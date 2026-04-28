-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'ALERT_LOG');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED_BY_PREFERENCE', 'SENT_AS_DIGEST');

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "notifications" JSONB;

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "context" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "digestRunId" TEXT,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_userId_key_key" ON "NotificationDelivery"("userId", "key");

-- CreateIndex
CREATE INDEX "NotificationDelivery_userId_createdAt_idx" ON "NotificationDelivery"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_eventType_createdAt_idx" ON "NotificationDelivery"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
