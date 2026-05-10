-- CreateEnum
CREATE TYPE "UxMode" AS ENUM ('BEGINNER', 'FOCUS', 'EXPERT');

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "uxMode" "UxMode" NOT NULL DEFAULT 'FOCUS';
