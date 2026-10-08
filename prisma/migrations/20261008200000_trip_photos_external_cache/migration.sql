-- Roteiro inteligente, fase 3: fotos por URL e cache de serviços externos.
-- Ver docs/rfc/0004-roteiro-inteligente.md.

-- AlterTable
ALTER TABLE "trip_stops" ADD COLUMN     "photo_credit" TEXT,
ADD COLUMN     "photo_source_url" TEXT,
ADD COLUMN     "photo_url" TEXT,
ADD COLUMN     "wiki_title" TEXT;

-- AlterTable
ALTER TABLE "trip_activities" ADD COLUMN     "photo_credit" TEXT,
ADD COLUMN     "photo_source_url" TEXT,
ADD COLUMN     "photo_url" TEXT,
ADD COLUMN     "wiki_title" TEXT;

-- CreateTable
CREATE TABLE "external_cache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_cache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "external_cache_expires_at_idx" ON "external_cache"("expires_at");

