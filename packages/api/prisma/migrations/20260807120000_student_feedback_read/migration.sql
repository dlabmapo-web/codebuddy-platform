-- Feedback the student has opened.
--
-- Null is unread. Existing rows are backfilled to read: they predate any
-- student-facing surface, so nobody could have missed them, and leaving them
-- null would greet every student with a panel full of history on first load.
--
-- No new index. `teacher_feedback_student_material_created_at_idx` already
-- leads with (student_membership_ref, material_id), which is the whole
-- selection; `read_at` only filters a thread that is bounded to a page.
ALTER TABLE "teacher_feedback" ADD COLUMN "read_at" TIMESTAMPTZ(6);

UPDATE "teacher_feedback" SET "read_at" = "created_at" WHERE "read_at" IS NULL;
