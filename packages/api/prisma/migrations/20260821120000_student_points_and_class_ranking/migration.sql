-- Student points and the class ranking.
-- See docs/superpowers/specs/2026-08-21-student-points-and-class-ranking-design.md

-- Both flags are per-academy opt-ins. A missing row means off, so no existing
-- academy starts inside this rollout.
ALTER TYPE "AcademyFeature" ADD VALUE IF NOT EXISTS 'STUDENT_POINTS';
ALTER TYPE "AcademyFeature" ADD VALUE IF NOT EXISTS 'STUDENT_CLASS_LEADERBOARD';

-- Every value names a fact the server observed. There is no reason code for a
-- granted point and none for a penalty. §5.2 and §7.6.
CREATE TYPE "PointReason" AS ENUM (
  'ATTENDANCE',
  'ATTENDANCE_LATE',
  'LEARNING_TIME',
  'EXERCISE_SOLVED',
  'LECTURE_COMPLETED',
  'MODULE_COMPLETED',
  'COURSE_COMPLETED'
);

-- When one class meets, as a recurring academy-local rule. §8.1.
CREATE TABLE "class_schedule_slots" (
  "id" UUID NOT NULL,
  "class_id" UUID NOT NULL,
  "weekday" INTEGER NOT NULL,
  "start_minute" INTEGER NOT NULL,
  "end_minute" INTEGER NOT NULL,
  "effective_from" DATE,
  "effective_to" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "class_schedule_slots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "class_schedule_slots_class_id_weekday_idx"
  ON "class_schedule_slots" ("class_id", "weekday");

ALTER TABLE "class_schedule_slots"
  ADD CONSTRAINT "class_schedule_slots_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- A weekday is ISO-8601 and a window never runs backwards. `end_minute` may
-- exceed 1440 for a class that crosses midnight; it never wraps.
ALTER TABLE "class_schedule_slots"
  ADD CONSTRAINT "class_schedule_slots_weekday_check"
  CHECK ("weekday" BETWEEN 1 AND 7);
ALTER TABLE "class_schedule_slots"
  ADD CONSTRAINT "class_schedule_slots_window_check"
  CHECK ("start_minute" >= 0 AND "end_minute" > "start_minute");

-- The ledger. Append-only, and the only writer is the server.
CREATE TABLE "point_awards" (
  "id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "reason" "PointReason" NOT NULL,
  "amount" INTEGER NOT NULL,
  "dedupe_key" TEXT NOT NULL,
  "material_id" UUID,
  "lecture_id" UUID,
  "module_id" UUID,
  "course_id" UUID,
  "class_id" UUID,
  "local_date" DATE,
  "subject_label" TEXT NOT NULL,
  "difficulty" "ExerciseDifficulty",
  "capped_at" TIMESTAMPTZ(6),
  "voided_at" TIMESTAMPTZ(6),
  "voided_by_membership_id" UUID,
  "void_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "point_awards_pkey" PRIMARY KEY ("id")
);

-- Points are earned, never lost. The constraint is the design, not a guard:
-- there is no shape a deduction could travel in. §7.6.
ALTER TABLE "point_awards"
  ADD CONSTRAINT "point_awards_amount_positive_check" CHECK ("amount" > 0);

-- The idempotency key, and the whole concurrency design. A retried judge
-- callback or a replayed activity flush collides here and writes nothing. §9.3.
CREATE UNIQUE INDEX "point_awards_dedupe_key_key"
  ON "point_awards" ("dedupe_key");

-- The period sum behind every leaderboard row.
CREATE INDEX "point_awards_academy_id_membership_id_created_at_idx"
  ON "point_awards" ("academy_id", "membership_id", "created_at");

-- One student's ledger, newest first, with the tiebreak paging needs.
CREATE INDEX "point_awards_membership_id_created_at_id_idx"
  ON "point_awards" ("membership_id", "created_at" DESC, "id" DESC);

-- The daily cap, which is checked before every single award.
CREATE INDEX "point_awards_membership_id_local_date_idx"
  ON "point_awards" ("membership_id", "local_date");

ALTER TABLE "point_awards"
  ADD CONSTRAINT "point_awards_academy_id_fkey"
  FOREIGN KEY ("academy_id") REFERENCES "academies" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "point_awards"
  ADD CONSTRAINT "point_awards_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The projection. Rebuildable by SUM at any time; the ledger is the truth.
CREATE TABLE "student_point_balances" (
  "membership_id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "earned_total" INTEGER NOT NULL DEFAULT 0,
  "spent_total" INTEGER NOT NULL DEFAULT 0,
  "stamp_count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "student_point_balances_pkey" PRIMARY KEY ("membership_id")
);

CREATE INDEX "student_point_balances_academy_id_idx"
  ON "student_point_balances" ("academy_id");

ALTER TABLE "student_point_balances"
  ADD CONSTRAINT "student_point_balances_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- One academy's economy. A missing row means the defaults in @cove/shared, so
-- enabling points never requires a manager to fill a form first.
CREATE TABLE "academy_point_policies" (
  "academy_id" UUID NOT NULL,
  "solve_easy" INTEGER NOT NULL DEFAULT 3,
  "solve_medium" INTEGER NOT NULL DEFAULT 5,
  "solve_hard" INTEGER NOT NULL DEFAULT 10,
  "lecture_completed" INTEGER NOT NULL DEFAULT 15,
  "module_completed" INTEGER NOT NULL DEFAULT 40,
  "course_completed" INTEGER NOT NULL DEFAULT 150,
  "attendance" INTEGER NOT NULL DEFAULT 5,
  "attendance_late" INTEGER NOT NULL DEFAULT 2,
  "attendance_min_minutes" INTEGER NOT NULL DEFAULT 10,
  "attendance_grace_minutes" INTEGER NOT NULL DEFAULT 15,
  "learning_time_tier1_minutes" INTEGER NOT NULL DEFAULT 30,
  "learning_time_tier1_points" INTEGER NOT NULL DEFAULT 3,
  "learning_time_tier2_minutes" INTEGER NOT NULL DEFAULT 60,
  "learning_time_tier2_points" INTEGER NOT NULL DEFAULT 5,
  "learning_time_tier3_minutes" INTEGER NOT NULL DEFAULT 120,
  "learning_time_tier3_points" INTEGER NOT NULL DEFAULT 7,
  "student_daily_cap" INTEGER NOT NULL DEFAULT 100,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "academy_point_policies_pkey" PRIMARY KEY ("academy_id")
);

ALTER TABLE "academy_point_policies"
  ADD CONSTRAINT "academy_point_policies_academy_id_fkey"
  FOREIGN KEY ("academy_id") REFERENCES "academies" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
