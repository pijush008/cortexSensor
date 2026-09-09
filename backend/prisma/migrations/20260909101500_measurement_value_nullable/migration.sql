-- AlterTable
ALTER TABLE "measurements" ALTER COLUMN "value" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "measurements_ts_idx" ON "measurements"("ts");

