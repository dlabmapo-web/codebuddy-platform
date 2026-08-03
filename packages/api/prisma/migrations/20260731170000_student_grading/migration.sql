-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'ERRORED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CaseOutcome" AS ENUM ('PASSED', 'WRONG_OUTPUT', 'RUNTIME_ERROR', 'TIME_LIMIT', 'MEMORY_LIMIT', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ExerciseProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SOLVED');

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "course_version_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "passed_count" INTEGER NOT NULL DEFAULT 0,
    "total_count" INTEGER NOT NULL,
    "runtime_ms" INTEGER,
    "engine_version" TEXT NOT NULL,
    "failure_reason" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "graded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_cases" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "is_sample" BOOLEAN NOT NULL,
    "outcome" "CaseOutcome" NOT NULL,
    "runtime_ms" INTEGER,
    "actual_output" TEXT,

    CONSTRAINT "submission_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_exercise_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "status" "ExerciseProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "best_passed" INTEGER NOT NULL DEFAULT 0,
    "first_solved_at" TIMESTAMPTZ(6),
    "last_attempt_at" TIMESTAMPTZ(6),

    CONSTRAINT "student_exercise_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "submissions_user_id_material_id_created_at_idx" ON "submissions"("user_id", "material_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "submissions_status_created_at_idx" ON "submissions"("status", "created_at");

-- One in-flight submission per student per problem, enforced by the database
-- rather than by a read-then-write check in application code. v1 learned this
-- the hard way and could still race two concurrent submits past its guard.
-- Prisma cannot express a partial unique index, so it is written by hand and
-- the schema carries a matching comment.
CREATE UNIQUE INDEX "submissions_one_active_per_user_material"
    ON "submissions" ("user_id", "material_id")
    WHERE "status" IN ('QUEUED', 'RUNNING');

-- CreateIndex
CREATE UNIQUE INDEX "submission_cases_submission_id_position_key" ON "submission_cases"("submission_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "student_exercise_progress_user_id_material_id_key" ON "student_exercise_progress"("user_id", "material_id");

-- CreateIndex
CREATE INDEX "student_exercise_progress_user_id_status_idx" ON "student_exercise_progress"("user_id", "status");

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_cases" ADD CONSTRAINT "submission_cases_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_exercise_progress" ADD CONSTRAINT "student_exercise_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_exercise_progress" ADD CONSTRAINT "student_exercise_progress_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
