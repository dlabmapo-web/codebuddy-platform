-- Teachers who help run a class beside its homeroom teacher.
--
-- `classes.teacher_membership_id` keeps its meaning: the one person answerable
-- for the class, which is what monitoring, points, and the student's "your
-- teacher" all read. Assistants are added here, so no existing row changes and
-- no backfill is needed — every class starts with the teacher it already had
-- and no assistants.
CREATE TABLE "class_assistant_teachers" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_assistant_teachers_pkey" PRIMARY KEY ("id")
);

-- The same person cannot assist one class twice.
CREATE UNIQUE INDEX "class_assistant_teachers_class_id_membership_id_key"
  ON "class_assistant_teachers"("class_id", "membership_id");

-- Answers "which classes does this teacher help run", the assistant half of
-- the assigned-class predicate.
CREATE INDEX "class_assistant_teachers_membership_id_idx"
  ON "class_assistant_teachers"("membership_id");

ALTER TABLE "class_assistant_teachers"
  ADD CONSTRAINT "class_assistant_teachers_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Cascade, unlike the homeroom column's SET NULL: a class left with no
-- homeroom teacher is a state a manager has to see and fix, while a deleted
-- membership's assistant row means nothing and should simply go.
ALTER TABLE "class_assistant_teachers"
  ADD CONSTRAINT "class_assistant_teachers_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "academy_memberships"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
