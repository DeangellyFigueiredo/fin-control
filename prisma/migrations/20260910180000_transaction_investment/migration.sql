-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "investment_id" TEXT,
ADD COLUMN     "is_retroactive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "investment_entries" ADD COLUMN     "is_retroactive" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "transactions_investment_id_idx" ON "transactions"("investment_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
