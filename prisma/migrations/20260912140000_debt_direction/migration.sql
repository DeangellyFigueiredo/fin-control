-- Dívidas passam a ter direção: OWE (eu devo) e LENT (me devem).
-- O que já existe é dívida minha, então o default cobre a migração.

-- AlterTable
ALTER TABLE "debts" ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'OWE';

-- RenameColumn: "credor" fica errado quando é você quem emprestou
ALTER TABLE "debts" RENAME COLUMN "creditor" TO "counterpart";

-- CreateIndex
CREATE INDEX "debts_direction_idx" ON "debts"("direction");
