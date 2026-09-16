-- A resposta dada a uma ocorrência de recorrente: foi lançada de fato, ou
-- foi cancelada naquele mês.
--
-- Só existe linha quando alguém respondeu — "pendente" é a ausência de linha.
-- Assim uma recorrente mensal não nasce com 120 registros de estado vazio.
CREATE TABLE "reminder_events" (
    "id" TEXT NOT NULL,
    "recurring_id" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "transaction_id" TEXT,
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "wallet_id" TEXT NOT NULL,

    CONSTRAINT "reminder_events_pkey" PRIMARY KEY ("id")
);

-- Uma resposta por ocorrência
CREATE UNIQUE INDEX "reminder_events_recurring_id_year_month_key"
  ON "reminder_events"("recurring_id", "year", "month");
CREATE INDEX "reminder_events_user_id_idx" ON "reminder_events"("user_id");
CREATE INDEX "reminder_events_wallet_id_idx" ON "reminder_events"("wallet_id");

ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_recurring_id_fkey"
  FOREIGN KEY ("recurring_id") REFERENCES "recurring_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- O lançamento pode ser apagado depois; a baixa continua valendo, só perde o vínculo
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_transaction_id_fkey"
  FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_wallet_id_fkey"
  FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
