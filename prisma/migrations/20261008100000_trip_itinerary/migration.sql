-- Viagens: roteiro (paradas, atividades e o gasto ligado à atividade).
-- Ver docs/rfc/0003-roteiro.md.

-- AlterTable
ALTER TABLE "trip_entries" ADD COLUMN     "activity_id" TEXT;

-- CreateTable
CREATE TABLE "trip_stops" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL,
    "city" TEXT NOT NULL,
    "uf" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "lodging_name" TEXT NOT NULL DEFAULT '',
    "lodging_url" TEXT NOT NULL DEFAULT '',
    "pet_policy" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "leg_km" DOUBLE PRECISION,
    "leg_minutes" INTEGER,
    "leg_notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trip_activities" (
    "id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT,
    "period" TEXT NOT NULL DEFAULT 'MANHA',
    "order" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "place" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "estimated_cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pet" TEXT NOT NULL DEFAULT 'VERIFICAR',
    "status" TEXT NOT NULL DEFAULT 'PLANEJADA',
    "link" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trip_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trip_stops_trip_id_date_idx" ON "trip_stops"("trip_id", "date");

-- CreateIndex
CREATE INDEX "trip_activities_trip_id_date_idx" ON "trip_activities"("trip_id", "date");

-- CreateIndex
CREATE INDEX "trip_entries_activity_id_idx" ON "trip_entries"("activity_id");

-- AddForeignKey
ALTER TABLE "trip_entries" ADD CONSTRAINT "trip_entries_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "trip_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trip_activities" ADD CONSTRAINT "trip_activities_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

