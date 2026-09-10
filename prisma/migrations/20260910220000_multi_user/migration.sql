-- Torna os dados pertencentes a um usuário.
--
-- Três passos por tabela: a coluna nasce anulável, é preenchida com o
-- usuário mais antigo (o dono dos dados que já existem) e só então vira
-- obrigatória. Fazer NOT NULL de cara falharia com as linhas existentes.

-- AlterTable: coluna anulável
ALTER TABLE "bank_accounts"      ADD COLUMN "user_id" TEXT;
ALTER TABLE "categories"         ADD COLUMN "user_id" TEXT;
ALTER TABLE "transactions"       ADD COLUMN "user_id" TEXT;
ALTER TABLE "monthly_summaries"  ADD COLUMN "user_id" TEXT;
ALTER TABLE "investments"        ADD COLUMN "user_id" TEXT;
ALTER TABLE "investment_entries" ADD COLUMN "user_id" TEXT;
ALTER TABLE "financial_goals"    ADD COLUMN "user_id" TEXT;
ALTER TABLE "recurring_entries"  ADD COLUMN "user_id" TEXT;
ALTER TABLE "credit_cards"       ADD COLUMN "user_id" TEXT;

-- Backfill: tudo que já existe pertence ao primeiro usuário cadastrado
UPDATE "bank_accounts"      SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1) WHERE "user_id" IS NULL;
UPDATE "categories"         SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1) WHERE "user_id" IS NULL;
UPDATE "transactions"       SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1) WHERE "user_id" IS NULL;
UPDATE "monthly_summaries"  SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1) WHERE "user_id" IS NULL;
UPDATE "investments"        SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1) WHERE "user_id" IS NULL;
UPDATE "investment_entries" SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1) WHERE "user_id" IS NULL;
UPDATE "financial_goals"    SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1) WHERE "user_id" IS NULL;
UPDATE "recurring_entries"  SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1) WHERE "user_id" IS NULL;
UPDATE "credit_cards"       SET "user_id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC LIMIT 1) WHERE "user_id" IS NULL;

-- Banco sem nenhum usuário: as tabelas estão vazias, mas o DELETE deixa o
-- passo seguinte seguro em qualquer cenário.
DELETE FROM "investment_entries" WHERE "user_id" IS NULL;
DELETE FROM "transactions"       WHERE "user_id" IS NULL;
DELETE FROM "monthly_summaries"  WHERE "user_id" IS NULL;
DELETE FROM "recurring_entries"  WHERE "user_id" IS NULL;
DELETE FROM "credit_cards"       WHERE "user_id" IS NULL;
DELETE FROM "financial_goals"    WHERE "user_id" IS NULL;
DELETE FROM "investments"        WHERE "user_id" IS NULL;
DELETE FROM "categories"         WHERE "user_id" IS NULL;
DELETE FROM "bank_accounts"      WHERE "user_id" IS NULL;

-- AlterTable: agora obrigatória
ALTER TABLE "bank_accounts"      ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "categories"         ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "transactions"       ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "monthly_summaries"  ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "investments"        ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "investment_entries" ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "financial_goals"    ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "recurring_entries"  ALTER COLUMN "user_id" SET NOT NULL;
ALTER TABLE "credit_cards"       ALTER COLUMN "user_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "bank_accounts_user_id_idx"      ON "bank_accounts"("user_id");
CREATE INDEX "categories_user_id_idx"         ON "categories"("user_id");
CREATE INDEX "transactions_user_id_idx"       ON "transactions"("user_id");
CREATE INDEX "monthly_summaries_user_id_idx"  ON "monthly_summaries"("user_id");
CREATE INDEX "investments_user_id_idx"        ON "investments"("user_id");
CREATE INDEX "investment_entries_user_id_idx" ON "investment_entries"("user_id");
CREATE INDEX "financial_goals_user_id_idx"    ON "financial_goals"("user_id");
CREATE INDEX "recurring_entries_user_id_idx"  ON "recurring_entries"("user_id");
CREATE INDEX "credit_cards_user_id_idx"       ON "credit_cards"("user_id");

-- AddForeignKey
ALTER TABLE "bank_accounts"      ADD CONSTRAINT "bank_accounts_user_id_fkey"      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "categories"         ADD CONSTRAINT "categories_user_id_fkey"         FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transactions"       ADD CONSTRAINT "transactions_user_id_fkey"       FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monthly_summaries"  ADD CONSTRAINT "monthly_summaries_user_id_fkey"  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "investments"        ADD CONSTRAINT "investments_user_id_fkey"        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "investment_entries" ADD CONSTRAINT "investment_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "financial_goals"    ADD CONSTRAINT "financial_goals_user_id_fkey"    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_entries"  ADD CONSTRAINT "recurring_entries_user_id_fkey"  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_cards"       ADD CONSTRAINT "credit_cards_user_id_fkey"       FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
