-- Class-scoped learning and point attribution.
-- Historical facts are attributed only when their class is unambiguous.

ALTER TABLE "submissions" ADD COLUMN "class_id" UUID;
ALTER TABLE "exercise_solve_sessions" ADD COLUMN "class_id" UUID;

ALTER TABLE "submissions"
  ADD CONSTRAINT "submissions_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "exercise_solve_sessions"
  ADD CONSTRAINT "exercise_solve_sessions_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "submissions_class_id_user_id_created_at_idx"
  ON "submissions" ("class_id", "user_id", "created_at" DESC);

CREATE TABLE "student_class_course_learning_days" (
  "academy_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "class_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "local_date" DATE NOT NULL,
  "active_seconds" INTEGER NOT NULL DEFAULT 0,
  "active_intervals" INTEGER NOT NULL DEFAULT 0,
  "first_active_at" TIMESTAMPTZ(6) NOT NULL,
  "last_active_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "student_class_course_learning_days_pkey"
    PRIMARY KEY ("academy_id", "membership_id", "class_id", "course_id", "local_date")
);

ALTER TABLE "student_class_course_learning_days"
  ADD CONSTRAINT "student_class_course_learning_days_academy_id_fkey"
  FOREIGN KEY ("academy_id") REFERENCES "academies" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_class_course_learning_days"
  ADD CONSTRAINT "student_class_course_learning_days_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_class_course_learning_days"
  ADD CONSTRAINT "student_class_course_learning_days_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_class_course_learning_days"
  ADD CONSTRAINT "student_class_course_learning_days_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "student_class_course_learning_days_class_id_local_date_membership_id_idx"
  ON "student_class_course_learning_days" ("class_id", "local_date", "membership_id");
CREATE INDEX "student_class_course_learning_days_membership_id_class_id_local_date_idx"
  ON "student_class_course_learning_days" ("membership_id", "class_id", "local_date");

-- Academy/course learning history can be copied only when exactly one class
-- was assigned and enrolled before the first accepted activity interval.
WITH candidates AS (
  SELECT
    day."academy_id",
    day."membership_id",
    day."course_id",
    day."local_date",
    day."active_seconds",
    day."active_intervals",
    day."first_active_at",
    day."last_active_at",
    day."updated_at",
    MIN(enrollment."class_id"::text)::uuid AS "class_id",
    COUNT(*) AS "candidate_count"
  FROM "student_course_learning_days" day
  JOIN "class_enrollments" enrollment
    ON enrollment."membership_id" = day."membership_id"
   AND enrollment."enrolled_at" <= day."first_active_at"
  JOIN "class_courses" assignment
    ON assignment."class_id" = enrollment."class_id"
   AND assignment."course_id" = day."course_id"
   AND assignment."assigned_at" <= day."first_active_at"
  JOIN "classes" class
    ON class."id" = enrollment."class_id"
   AND class."academy_id" = day."academy_id"
  GROUP BY
    day."academy_id", day."membership_id", day."course_id", day."local_date",
    day."active_seconds", day."active_intervals", day."first_active_at",
    day."last_active_at", day."updated_at"
)
INSERT INTO "student_class_course_learning_days" (
  "academy_id", "membership_id", "class_id", "course_id", "local_date",
  "active_seconds", "active_intervals", "first_active_at", "last_active_at", "updated_at"
)
SELECT
  "academy_id", "membership_id", "class_id", "course_id", "local_date",
  "active_seconds", "active_intervals", "first_active_at", "last_active_at", "updated_at"
FROM candidates
WHERE "candidate_count" = 1;

-- The same conservative rule applies to old awards. Ambiguous awards stay
-- classless and are intentionally excluded from class leaderboards.
WITH candidates AS (
  SELECT award."id", MIN(enrollment."class_id"::text)::uuid AS "class_id", COUNT(*) AS "candidate_count"
  FROM "point_awards" award
  JOIN "class_enrollments" enrollment
    ON enrollment."membership_id" = award."membership_id"
   AND enrollment."enrolled_at" <= award."created_at"
  JOIN "class_courses" assignment
    ON assignment."class_id" = enrollment."class_id"
   AND assignment."course_id" = award."course_id"
   AND assignment."assigned_at" <= award."created_at"
  JOIN "classes" class
    ON class."id" = enrollment."class_id"
   AND class."academy_id" = award."academy_id"
  WHERE award."class_id" IS NULL AND award."course_id" IS NOT NULL
  GROUP BY award."id"
)
UPDATE "point_awards" award
SET "class_id" = candidates."class_id"
FROM candidates
WHERE award."id" = candidates."id" AND candidates."candidate_count" = 1;

ALTER TABLE "point_awards"
  ADD CONSTRAINT "point_awards_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX "point_awards_academy_id_membership_id_created_at_idx";
DROP INDEX "point_awards_membership_id_local_date_idx";
CREATE INDEX "point_awards_academy_id_class_id_membership_id_created_at_idx"
  ON "point_awards" ("academy_id", "class_id", "membership_id", "created_at");
CREATE INDEX "point_awards_membership_id_class_id_local_date_idx"
  ON "point_awards" ("membership_id", "class_id", "local_date");
