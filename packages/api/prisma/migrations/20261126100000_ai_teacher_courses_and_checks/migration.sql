-- The AI teacher for one campus (docs/superpowers/specs/2026-11-26-cove-ai-teacher-campus-courses-design.md):
-- a course-level switch, and AI help after Run and Test run through a server
-- check of the student's code against the problem's examples.

-- AlterTable
ALTER TABLE "courses" ADD COLUMN "ai_teacher_enabled" BOOLEAN NOT NULL DEFAULT false;

-- A Python course that already uses AI on a problem keeps it: nothing that
-- works today changes.
UPDATE "courses" c SET "ai_teacher_enabled" = true
WHERE c."language" = 'PYTHON' AND EXISTS (
  SELECT 1 FROM "course_modules" cm
  JOIN "lectures" l ON l."course_module_id" = cm."id"
  JOIN "materials" m ON m."lecture_id" = l."id"
  JOIN "programming_exercises" pe ON pe."material_id" = m."id"
  WHERE cm."course_id" = c."id" AND pe."ai_feedback_enabled");

-- CreateEnum
CREATE TYPE "AiHelpSource" AS ENUM ('SUBMIT', 'TEST_RUN', 'RUN');

-- CreateTable
CREATE TABLE "ai_help_checks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "class_id" UUID,
    "material_id" UUID NOT NULL,
    "grading_revision" INTEGER NOT NULL,
    "source" "AiHelpSource" NOT NULL,
    "code" TEXT NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "execution_queue" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "results" JSONB,
    "fingerprint" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_help_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_help_checks_user_id_material_id_code_hash_idx" ON "ai_help_checks"("user_id", "material_id", "code_hash");

-- CreateIndex
CREATE INDEX "ai_help_checks_status_created_at_idx" ON "ai_help_checks"("status", "created_at");

-- AddForeignKey
ALTER TABLE "ai_help_checks" ADD CONSTRAINT "ai_help_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_help_checks" ADD CONSTRAINT "ai_help_checks_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_help_checks" ADD CONSTRAINT "ai_help_checks_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ai_help_replies" ALTER COLUMN "submission_id" DROP NOT NULL,
ADD COLUMN "check_id" UUID,
ADD COLUMN "source" "AiHelpSource" NOT NULL DEFAULT 'SUBMIT';

-- An answer is about a submission or about an example check, never both.
ALTER TABLE "ai_help_replies" ADD CONSTRAINT "ai_help_replies_one_subject" CHECK (num_nonnulls("submission_id", "check_id") = 1);

-- CreateIndex
CREATE INDEX "ai_help_replies_check_id_idx" ON "ai_help_replies"("check_id");

-- AddForeignKey
ALTER TABLE "ai_help_replies" ADD CONSTRAINT "ai_help_replies_check_id_fkey" FOREIGN KEY ("check_id") REFERENCES "ai_help_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
