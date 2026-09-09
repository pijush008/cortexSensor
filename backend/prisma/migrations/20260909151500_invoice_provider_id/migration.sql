-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "providerInvoiceId" VARCHAR(128);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_providerInvoiceId_key" ON "invoices"("providerInvoiceId");

