-- Roteiro inteligente, fase 5: folga de estrada, chegada desejada e quem viaja.
-- Ver docs/rfc/0004-roteiro-inteligente.md.

-- AlterTable
ALTER TABLE "trips" ADD COLUMN     "road_buffer_pct" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "traveler_notes" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "trip_stops" ADD COLUMN     "arrive_by" TEXT,
ADD COLUMN     "leg_buffer_pct" INTEGER;

