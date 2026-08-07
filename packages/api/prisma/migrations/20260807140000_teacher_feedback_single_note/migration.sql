-- One note per teacher, per student, per exercise — edited in place.
--
-- Additive only. No unique constraint and no delete: rows written under the
-- previous append-only behaviour stay exactly where they are, and the reads
-- return the newest note per teacher instead. Enforcing uniqueness in the
-- schema would mean destroying that history first.
ALTER TABLE "teacher_feedback"
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

-- A note nobody has rewritten was last written when it was created.
UPDATE "teacher_feedback" SET "updated_at" = "created_at";

-- Serves the upsert lookup: the one note this teacher already wrote this
-- student for this exercise.
CREATE INDEX "teacher_feedback_author_thread_idx"
  ON "teacher_feedback" (
    "teacher_membership_ref",
    "student_membership_ref",
    "material_id",
    "created_at" DESC
  );
