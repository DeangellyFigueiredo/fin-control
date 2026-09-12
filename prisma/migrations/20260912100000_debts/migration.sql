-- CreateTable
CREATE TABLE "debts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creditor" TEXT NOT NULL DEFAULT '',
    "original_amount" DOUBLE PRECISION NOT NULL,
    "start_date" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "color" TEXT NOT NULL DEFAULT '#e66767',
    "icon" TEXT NOT NULL DEFAULT '🤝',
    "notes" TEXT NOT NULL DEFAULT '',
    "is_settled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "debt_id" TEXT;

-- CreateIndex
CREATE INDEX "debts_user_id_idx" ON "debts"("user_id");
CREATE INDEX "debts_is_settled_idx" ON "debts"("is_settled");
CREATE INDEX "transactions_debt_id_idx" ON "transactions"("debt_id");

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Apagar a dívida não apaga o pagamento: o dinheiro saiu de fato, então a
-- transação continua existindo como uma saída comum.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_debt_id_fkey" FOREIGN KEY ("debt_id") REFERENCES "debts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
