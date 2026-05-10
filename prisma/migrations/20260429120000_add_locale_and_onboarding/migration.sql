-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'nl';
ALTER TABLE "UserProfile" ADD COLUMN "onboardedAt" TIMESTAMP(3);
