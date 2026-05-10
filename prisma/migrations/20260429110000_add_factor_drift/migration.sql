-- CreateTable
CREATE TABLE "FactorDriftSnapshot" (
    "id" TEXT NOT NULL,
    "factor" TEXT NOT NULL,
    "window" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ic" DECIMAL(6,4),
    "hitRate" DECIMAL(5,4),
    "sampleSize" INTEGER NOT NULL,
    "narrative" TEXT,
    "metadata" JSONB,

    CONSTRAINT "FactorDriftSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FactorDriftSnapshot_factor_capturedAt_window_key" ON "FactorDriftSnapshot"("factor", "capturedAt", "window");

-- CreateIndex
CREATE INDEX "FactorDriftSnapshot_factor_capturedAt_idx" ON "FactorDriftSnapshot"("factor", "capturedAt");
