-- CreateTable
CREATE TABLE "card_bills" (
    "id" TEXT NOT NULL,
    "credit_card_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "card_bills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: um valor por cartão/mês
CREATE UNIQUE INDEX "card_bills_credit_card_id_year_month_key" ON "card_bills"("credit_card_id", "year", "month");
CREATE INDEX "card_bills_user_id_idx" ON "card_bills"("user_id");

-- AddForeignKey
ALTER TABLE "card_bills" ADD CONSTRAINT "card_bills_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "card_bills" ADD CONSTRAINT "card_bills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
