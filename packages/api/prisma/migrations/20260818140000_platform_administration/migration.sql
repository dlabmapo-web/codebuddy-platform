-- Platform administration: academy lifecycle and provenance.
--
-- Follows docs/design/2026-08-18-cove-v2-platform-administration-design.md §4.
--
-- Three small changes, one idea each.
--
-- `status_changed_at` records when the platform last moved an academy between
-- ACTIVE, SUSPENDED, and ARCHIVED. One column rather than a timestamp per
-- state: an academy has two terminal-ish states plus a reversible one, so
-- `archived_at` and `suspended_at` together would need a rule about which wins
-- after a suspend-then-archive. The reason for a move lives on the audit row.
--
-- `created_by_user_id` records which operator onboarded the academy. Nullable
-- because every existing academy was seeded and has no creator, and ON DELETE
-- SET NULL so removing a departed operator never blocks on their academies.
--
-- ACADEMY_SUSPENDED joins the monitoring end reasons. The live-monitoring
-- connection guard runs once, at connect time, so a watch opened before a
-- suspension survives it until the lifecycle service closes the room and tells
-- both sides why.

ALTER TABLE "academies"
  ADD COLUMN "status_changed_at" TIMESTAMPTZ(6),
  ADD COLUMN "created_by_user_id" UUID;

ALTER TABLE "academies"
  ADD CONSTRAINT "academies_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Answers the platform academy list's default ordering without a sort.
CREATE INDEX "academies_status_created_at_idx"
  ON "academies" ("status", "created_at" DESC);

ALTER TYPE "MonitoringVisitEndReason"
  ADD VALUE IF NOT EXISTS 'ACADEMY_SUSPENDED';
