-- Viagens, fase 2: convite por link. Ver docs/rfc/0002-viagens.md.
--
-- Só o hash do token fica no banco; o token existe apenas no link.

-- CreateTable
CREATE TABLE "trip_invites" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_by_id" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trip_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "trip_invites_token_hash_key" ON "trip_invites"("token_hash");

-- CreateIndex
CREATE INDEX "trip_invites_trip_id_idx" ON "trip_invites"("trip_id");

-- AddForeignKey
ALTER TABLE "trip_invites" ADD CONSTRAINT "trip_invites_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_invites" ADD CONSTRAINT "trip_invites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

