-- A slug this academy used to answer to, so a rename redirects instead of
-- breaking every link the academy has ever appeared in.
CREATE TABLE "academy_slug_history" (
    "slug" TEXT NOT NULL,
    "academy_id" UUID NOT NULL,
    "retired_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academy_slug_history_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "academy_slug_history_academy_id_idx" ON "academy_slug_history"("academy_id");

ALTER TABLE "academy_slug_history"
    ADD CONSTRAINT "academy_slug_history_academy_id_fkey"
    FOREIGN KEY ("academy_id") REFERENCES "academies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
