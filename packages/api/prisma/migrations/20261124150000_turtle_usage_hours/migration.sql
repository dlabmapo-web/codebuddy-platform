-- Public Turtle use, per academy, hour and anonymous device. No person, IP
-- address or code: device_hash is a keyed hash of a random browser cookie.
CREATE TABLE "turtle_usage_hours" (
    "academy_id" UUID NOT NULL,
    "hour" TIMESTAMPTZ(6) NOT NULL,
    "device_hash" CHAR(32) NOT NULL,
    "entries" INTEGER NOT NULL DEFAULT 0,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "turtle_usage_hours_pkey" PRIMARY KEY ("academy_id", "hour", "device_hash")
);

CREATE INDEX "turtle_usage_hours_hour_idx" ON "turtle_usage_hours"("hour");

ALTER TABLE "turtle_usage_hours" ADD CONSTRAINT "turtle_usage_hours_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
