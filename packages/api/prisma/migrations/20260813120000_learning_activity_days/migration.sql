-- Active learning time, as a daily projection.
--
-- One row per student, course, and academy-local day. `local_date` is a DATE
-- rather than a timestamp because that is exactly what it means: the calendar
-- day the academy was teaching on, already resolved from its timezone by the
-- accumulator, so no reader has to re-derive it and none can derive it
-- differently.
CREATE TABLE "student_course_learning_days" (
  "academy_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "local_date" DATE NOT NULL,
  "active_seconds" INTEGER NOT NULL DEFAULT 0,
  "active_intervals" INTEGER NOT NULL DEFAULT 0,
  "first_active_at" TIMESTAMPTZ(6) NOT NULL,
  "last_active_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "student_course_learning_days_pkey"
    PRIMARY KEY ("academy_id", "membership_id", "course_id", "local_date")
);

-- The academy-wide daily momentum series.
CREATE INDEX "student_course_learning_days_academy_id_local_date_idx"
  ON "student_course_learning_days" ("academy_id", "local_date");

-- One student's own time in one course, for the participation scatter.
CREATE INDEX "student_course_learning_days_membership_id_course_id_local_date_idx"
  ON "student_course_learning_days" ("membership_id", "course_id", "local_date");

ALTER TABLE "student_course_learning_days"
  ADD CONSTRAINT "student_course_learning_days_academy_id_fkey"
  FOREIGN KEY ("academy_id") REFERENCES "academies" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_course_learning_days"
  ADD CONSTRAINT "student_course_learning_days_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_course_learning_days"
  ADD CONSTRAINT "student_course_learning_days_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The idempotency receipt for one flush.
--
-- No foreign keys: the receipt has to be insertable in the same transaction as
-- the increment with the smallest possible chance of failing for a reason
-- unrelated to duplication, and it is deleted within a week regardless.
CREATE TABLE "learning_activity_flushes" (
  "id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "learning_activity_flushes_pkey" PRIMARY KEY ("id")
);

-- Sweeping expired receipts is a range scan, not a table scan.
CREATE INDEX "learning_activity_flushes_created_at_idx"
  ON "learning_activity_flushes" ("created_at");
