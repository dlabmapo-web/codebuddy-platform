-- The one teacher responsible for a class. Nullable and deliberately not
-- unique: a class may run unassigned, and one teacher may run many classes.
--
-- Nothing is back-filled. A legacy teacher-student mapping is a guess, and a
-- guess here would hand a teacher authority over a class nobody chose for
-- them. Every existing class starts valid and unassigned.

ALTER TABLE "classes" ADD COLUMN "teacher_membership_id" UUID;

-- SetNull, not Cascade: deleting the membership leaves the class intact and
-- merely unassigned, and the audit log keeps the history readable.
ALTER TABLE "classes"
  ADD CONSTRAINT "classes_teacher_membership_id_fkey"
  FOREIGN KEY ("teacher_membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Answers "which active classes is this teacher responsible for", the query
-- the later monitoring design starts from.
CREATE INDEX "classes_teacher_membership_id_status_idx"
  ON "classes" ("teacher_membership_id", "status");
