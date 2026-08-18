-- Manager control tower: the academy's own identity, and a people revision.
--
-- Follows docs/superpowers/specs/2026-08-18-manager-control-tower-and-scalable-
-- people-operations-design.md §8.1.
--
-- Every profile column is nullable. An academy exists long before anyone fills
-- its address in, and a NOT NULL backfilled with '' would be indistinguishable
-- from an answer — the overview's completion prompt has to be able to tell the
-- difference between "not set" and "set to nothing".
--
-- `time_zone` is the exception, and is defaulted rather than nullable: every
-- period boundary on every analytics surface is drawn from it, so a null would
-- mean a page with no "today". 'Asia/Seoul' is what the constant it replaces
-- already assumed, so existing rows keep the behaviour they had.
--
-- `people_revision` starts at zero for everyone. It is a counter, not a
-- version of anything that exists yet: what matters is that two reads of the
-- same academy either agree or visibly do not.

ALTER TABLE "academies"
  ADD COLUMN "address_line1" TEXT,
  ADD COLUMN "address_line2" TEXT,
  ADD COLUMN "locality" TEXT,
  ADD COLUMN "region" TEXT,
  ADD COLUMN "postal_code" TEXT,
  ADD COLUMN "country_code" CHAR(2),
  ADD COLUMN "contact_phone" TEXT,
  ADD COLUMN "contact_email" TEXT,
  ADD COLUMN "time_zone" TEXT NOT NULL DEFAULT 'Asia/Seoul',
  ADD COLUMN "profile_updated_at" TIMESTAMPTZ(6),
  ADD COLUMN "people_revision" INTEGER NOT NULL DEFAULT 0;

-- The directory's default order is `updated_at DESC, id ASC` within one
-- academy, filtered by role and status. Without this, every page of a 2,000
-- member academy is a sort of the whole membership table.
CREATE INDEX "academy_memberships_academy_updated_idx"
  ON "academy_memberships" ("academy_id", "updated_at" DESC, "id");

-- Growth counts active student memberships by the day they joined.
CREATE INDEX "academy_memberships_academy_joined_idx"
  ON "academy_memberships" ("academy_id", "role", "status", "joined_at");
