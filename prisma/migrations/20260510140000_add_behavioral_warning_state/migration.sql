-- CreateEnum
CREATE TYPE "BehavioralWarningStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'SNOOZED');

-- CreateTable
CREATE TABLE "BehavioralWarningState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "status" "BehavioralWarningStatus" NOT NULL DEFAULT 'ACTIVE',
    "snoozedUntil" TIMESTAMP(3),
    "reasonNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BehavioralWarningState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BehavioralWarningState_userId_signalId_key" ON "BehavioralWarningState"("userId", "signalId");

-- CreateIndex
CREATE INDEX "BehavioralWarningState_userId_status_idx" ON "BehavioralWarningState"("userId", "status");

-- CreateIndex
CREATE INDEX "BehavioralWarningState_snoozedUntil_idx" ON "BehavioralWarningState"("snoozedUntil");

-- AddForeignKey
ALTER TABLE "BehavioralWarningState" ADD CONSTRAINT "BehavioralWarningState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
