-- AlterTable
ALTER TABLE "users" ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "financial_status" TEXT,
ADD COLUMN     "savings" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "onboarded_at" TIMESTAMP(3);
