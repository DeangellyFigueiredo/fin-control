-- Carteiras: a pessoa física e a PJ, olhadas separadas.
--
-- Migração em quatro tempos, sem perder nada: cria a tabela, dá uma carteira
-- "Pessoal" a cada usuário existente, joga todo o dado atual dentro dela e só
-- então torna a coluna obrigatória. Quem já usava o app não percebe diferença
-- além de um seletor novo no topo.

-- 1. A tabela
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PF',
    "color" TEXT NOT NULL DEFAULT '#6c5ce7',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wallets_user_id_idx" ON "wallets"("user_id");

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Uma carteira "Pessoal" por usuário que já existe
INSERT INTO "wallets" ("id", "name", "kind", "color", "is_default", "updated_at", "user_id")
SELECT gen_random_uuid(), 'Pessoal', 'PF', '#6c5ce7', true, CURRENT_TIMESTAMP, "id"
FROM "users";

-- 3. Coluna nova em cada tabela, preenchida com a carteira do dono

ALTER TABLE "bank_accounts" ADD COLUMN "wallet_id" TEXT;

UPDATE "bank_accounts" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "bank_accounts" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "bank_accounts_wallet_id_idx" ON "bank_accounts"("wallet_id");

ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "categories" ADD COLUMN "wallet_id" TEXT;

UPDATE "categories" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "categories" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "categories_wallet_id_idx" ON "categories"("wallet_id");

ALTER TABLE "categories" ADD CONSTRAINT "categories_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transactions" ADD COLUMN "wallet_id" TEXT;

UPDATE "transactions" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "transactions" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "transactions_wallet_id_idx" ON "transactions"("wallet_id");

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "monthly_summaries" ADD COLUMN "wallet_id" TEXT;

UPDATE "monthly_summaries" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "monthly_summaries" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "monthly_summaries_wallet_id_idx" ON "monthly_summaries"("wallet_id");

ALTER TABLE "monthly_summaries" ADD CONSTRAINT "monthly_summaries_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "investments" ADD COLUMN "wallet_id" TEXT;

UPDATE "investments" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "investments" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "investments_wallet_id_idx" ON "investments"("wallet_id");

ALTER TABLE "investments" ADD CONSTRAINT "investments_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "investment_entries" ADD COLUMN "wallet_id" TEXT;

UPDATE "investment_entries" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "investment_entries" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "investment_entries_wallet_id_idx" ON "investment_entries"("wallet_id");

ALTER TABLE "investment_entries" ADD CONSTRAINT "investment_entries_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "financial_goals" ADD COLUMN "wallet_id" TEXT;

UPDATE "financial_goals" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "financial_goals" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "financial_goals_wallet_id_idx" ON "financial_goals"("wallet_id");

ALTER TABLE "financial_goals" ADD CONSTRAINT "financial_goals_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recurring_entries" ADD COLUMN "wallet_id" TEXT;

UPDATE "recurring_entries" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "recurring_entries" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "recurring_entries_wallet_id_idx" ON "recurring_entries"("wallet_id");

ALTER TABLE "recurring_entries" ADD CONSTRAINT "recurring_entries_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "credit_cards" ADD COLUMN "wallet_id" TEXT;

UPDATE "credit_cards" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "credit_cards" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "credit_cards_wallet_id_idx" ON "credit_cards"("wallet_id");

ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "debts" ADD COLUMN "wallet_id" TEXT;

UPDATE "debts" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "debts" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "debts_wallet_id_idx" ON "debts"("wallet_id");

ALTER TABLE "debts" ADD CONSTRAINT "debts_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "card_bills" ADD COLUMN "wallet_id" TEXT;

UPDATE "card_bills" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "card_bills" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "card_bills_wallet_id_idx" ON "card_bills"("wallet_id");

ALTER TABLE "card_bills" ADD CONSTRAINT "card_bills_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "installments" ADD COLUMN "wallet_id" TEXT;

UPDATE "installments" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "installments" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "installments_wallet_id_idx" ON "installments"("wallet_id");

ALTER TABLE "installments" ADD CONSTRAINT "installments_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "category_rules" ADD COLUMN "wallet_id" TEXT;

UPDATE "category_rules" AS t
SET "wallet_id" = w."id"
FROM "wallets" AS w
WHERE w."user_id" = t."user_id" AND w."is_default" = true;

ALTER TABLE "category_rules" ALTER COLUMN "wallet_id" SET NOT NULL;

CREATE INDEX "category_rules_wallet_id_idx" ON "category_rules"("wallet_id");

ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. A regra de categorização passa a ser única por carteira, não por usuário:
-- "UBER" pode significar Transporte na PF e Despesa de viagem na PJ.
DROP INDEX IF EXISTS "category_rules_user_id_pattern_key";
CREATE UNIQUE INDEX "category_rules_wallet_id_pattern_key" ON "category_rules"("wallet_id", "pattern");
