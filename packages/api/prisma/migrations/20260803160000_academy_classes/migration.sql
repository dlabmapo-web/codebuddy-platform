-- Academy classes: the delivery boundary between reusable courses and
-- students. New empty tables only — no class is inferred from existing
-- memberships, so no student silently gains access to every course.

CREATE TYPE "ClassStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "classes" (
  "id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" "ClassStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" UUID NOT NULL,
  "archived_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- Names are deliberately not unique: an academy reuses "Level 1" every term.
CREATE INDEX "classes_academy_id_status_updated_at_idx"
  ON "classes" ("academy_id", "status", "updated_at" DESC);
CREATE INDEX "classes_academy_id_name_idx" ON "classes" ("academy_id", "name");

CREATE TABLE "class_courses" (
  "class_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "assigned_by_user_id" UUID NOT NULL,
  "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "class_courses_pkey" PRIMARY KEY ("class_id", "course_id")
);

-- Supports the student-access query, which starts from a course.
CREATE INDEX "class_courses_course_id_class_id_idx"
  ON "class_courses" ("course_id", "class_id");

CREATE TABLE "class_enrollments" (
  "class_id" UUID NOT NULL,
  "membership_id" UUID NOT NULL,
  "enrolled_by_user_id" UUID NOT NULL,
  "enrolled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("class_id", "membership_id")
);

-- Supports the student-access query, which starts from a membership.
CREATE INDEX "class_enrollments_membership_id_class_id_idx"
  ON "class_enrollments" ("membership_id", "class_id");

ALTER TABLE "classes"
  ADD CONSTRAINT "classes_academy_id_fkey"
  FOREIGN KEY ("academy_id") REFERENCES "academies" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "classes"
  ADD CONSTRAINT "classes_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_courses"
  ADD CONSTRAINT "class_courses_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_courses"
  ADD CONSTRAINT "class_courses_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_courses"
  ADD CONSTRAINT "class_courses_assigned_by_user_id_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_enrollments"
  ADD CONSTRAINT "class_enrollments_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_enrollments"
  ADD CONSTRAINT "class_enrollments_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_enrollments"
  ADD CONSTRAINT "class_enrollments_enrolled_by_user_id_fkey"
  FOREIGN KEY ("enrolled_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
