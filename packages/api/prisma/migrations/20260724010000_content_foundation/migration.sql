-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "CourseVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "MaterialType" AS ENUM ('PROGRAMMING_EXERCISE');
CREATE TYPE "ExerciseDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
CREATE TYPE "ExerciseLanguage" AS ENUM ('PYTHON');
CREATE TYPE "TestCaseVisibility" AS ENUM ('SAMPLE', 'HIDDEN');

-- CreateTable
CREATE TABLE "courses" (
  "id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" "CourseStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_versions" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "status" "CourseVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" UUID NOT NULL,
  "published_by_user_id" UUID,
  "published_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "course_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_versions_version_number_positive" CHECK ("version_number" > 0)
);

CREATE TABLE "course_modules" (
  "id" UUID NOT NULL,
  "course_version_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_modules_position_positive" CHECK ("position" > 0)
);

CREATE TABLE "lectures" (
  "id" UUID NOT NULL,
  "course_module_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "lectures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lectures_position_positive" CHECK ("position" > 0)
);

CREATE TABLE "materials" (
  "id" UUID NOT NULL,
  "lecture_id" UUID NOT NULL,
  "type" "MaterialType" NOT NULL,
  "title" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "materials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "materials_position_positive" CHECK ("position" > 0)
);

CREATE TABLE "programming_exercises" (
  "material_id" UUID NOT NULL,
  "course_version_id" UUID NOT NULL,
  "external_key" TEXT NOT NULL,
  "legacy_problem_no" INTEGER,
  "difficulty" "ExerciseDifficulty" NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "input_format" TEXT NOT NULL DEFAULT '',
  "output_format" TEXT NOT NULL DEFAULT '',
  "constraints" TEXT NOT NULL DEFAULT '',
  "starter_code" TEXT NOT NULL DEFAULT '',
  "language" "ExerciseLanguage" NOT NULL DEFAULT 'PYTHON',
  "time_limit_ms" INTEGER NOT NULL DEFAULT 2000,
  "memory_limit_mb" INTEGER NOT NULL DEFAULT 256,
  "ai_feedback_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "programming_exercises_pkey" PRIMARY KEY ("material_id"),
  CONSTRAINT "programming_exercises_limits_positive"
    CHECK ("time_limit_ms" > 0 AND "memory_limit_mb" > 0)
);

CREATE TABLE "exercise_test_cases" (
  "id" UUID NOT NULL,
  "exercise_material_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "input" TEXT NOT NULL,
  "expected_output" TEXT NOT NULL,
  "visibility" "TestCaseVisibility" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "exercise_test_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exercise_test_cases_position_positive" CHECK ("position" > 0)
);

CREATE TABLE "exercise_hints" (
  "id" UUID NOT NULL,
  "exercise_material_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "trigger_expression" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "exercise_hints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exercise_hints_position_positive" CHECK ("position" > 0)
);

-- CreateIndex
CREATE INDEX "courses_academy_id_status_updated_at_idx"
ON "courses"("academy_id", "status", "updated_at");

CREATE UNIQUE INDEX "courses_one_active_title_per_academy_key"
ON "courses"("academy_id", lower("title"))
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "course_versions_course_id_version_number_key"
ON "course_versions"("course_id", "version_number");

CREATE INDEX "course_versions_course_id_status_idx"
ON "course_versions"("course_id", "status");

CREATE UNIQUE INDEX "course_versions_one_draft_per_course_key"
ON "course_versions"("course_id")
WHERE "status" = 'DRAFT';

CREATE UNIQUE INDEX "course_modules_course_version_id_position_key"
ON "course_modules"("course_version_id", "position");
CREATE INDEX "course_modules_course_version_id_idx"
ON "course_modules"("course_version_id");

CREATE UNIQUE INDEX "lectures_course_module_id_position_key"
ON "lectures"("course_module_id", "position");
CREATE INDEX "lectures_course_module_id_idx"
ON "lectures"("course_module_id");

CREATE UNIQUE INDEX "materials_lecture_id_position_key"
ON "materials"("lecture_id", "position");
CREATE INDEX "materials_lecture_id_idx"
ON "materials"("lecture_id");

CREATE UNIQUE INDEX "programming_exercises_course_version_id_external_key_key"
ON "programming_exercises"("course_version_id", "external_key");
CREATE INDEX "programming_exercises_legacy_problem_no_idx"
ON "programming_exercises"("legacy_problem_no");

CREATE UNIQUE INDEX "exercise_test_cases_exercise_material_id_position_key"
ON "exercise_test_cases"("exercise_material_id", "position");

CREATE UNIQUE INDEX "exercise_hints_exercise_material_id_position_key"
ON "exercise_hints"("exercise_material_id", "position");

-- AddForeignKey
ALTER TABLE "courses"
ADD CONSTRAINT "courses_academy_id_fkey"
FOREIGN KEY ("academy_id") REFERENCES "academies"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "courses"
ADD CONSTRAINT "courses_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "course_versions"
ADD CONSTRAINT "course_versions_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "course_versions"
ADD CONSTRAINT "course_versions_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "course_versions"
ADD CONSTRAINT "course_versions_published_by_user_id_fkey"
FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "course_modules"
ADD CONSTRAINT "course_modules_course_version_id_fkey"
FOREIGN KEY ("course_version_id") REFERENCES "course_versions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lectures"
ADD CONSTRAINT "lectures_course_module_id_fkey"
FOREIGN KEY ("course_module_id") REFERENCES "course_modules"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "materials"
ADD CONSTRAINT "materials_lecture_id_fkey"
FOREIGN KEY ("lecture_id") REFERENCES "lectures"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "programming_exercises"
ADD CONSTRAINT "programming_exercises_material_id_fkey"
FOREIGN KEY ("material_id") REFERENCES "materials"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "programming_exercises"
ADD CONSTRAINT "programming_exercises_course_version_id_fkey"
FOREIGN KEY ("course_version_id") REFERENCES "course_versions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exercise_test_cases"
ADD CONSTRAINT "exercise_test_cases_exercise_material_id_fkey"
FOREIGN KEY ("exercise_material_id") REFERENCES "programming_exercises"("material_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exercise_hints"
ADD CONSTRAINT "exercise_hints_exercise_material_id_fkey"
FOREIGN KEY ("exercise_material_id") REFERENCES "programming_exercises"("material_id")
ON DELETE CASCADE ON UPDATE CASCADE;
