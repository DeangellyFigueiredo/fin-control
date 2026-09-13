-- CreateTable: compras parceladas, projetadas e não gravadas como transações futuras
CREATE TABLE "installments" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "total_amount" DOUBLE PRECISION NOT NULL,
    "count" INTEGER NOT NULL,
    "first_date" TIMESTAMP(3) NOT NULL,
    "credit_card_id" TEXT,
    "bank_account_id" TEXT,
    "category_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "installments_user_id_idx" ON "installments"("user_id");
CREATE INDEX "installments_active_idx" ON "installments"("active");

ALTER TABLE "installments" ADD CONSTRAINT "installments_credit_card_id_fkey" FOREIGN KEY ("credit_card_id") REFERENCES "credit_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "installments" ADD CONSTRAINT "installments_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "installments" ADD CONSTRAINT "installments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "installments" ADD CONSTRAINT "installments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: "UBER" -> Transporte. Padrão já normalizado, sem acento e em maiúsculas.
CREATE TABLE "category_rules" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "category_rules_pkey" PRIMARY KEY ("id")
);

-- Um padrão por usuário: aprender de novo atualiza a regra em vez de duplicar
CREATE UNIQUE INDEX "category_rules_user_id_pattern_key" ON "category_rules"("user_id", "pattern");
CREATE INDEX "category_rules_user_id_idx" ON "category_rules"("user_id");

ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
