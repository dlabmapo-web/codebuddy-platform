-- The Cove AI learning assistant: personalized replies, what they cost, and the
-- AI-written library of each exercise with the runs that tested it.
-- CreateEnum
CREATE TYPE "AiHelpStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "AiUsageKind" AS ENUM ('HELP', 'LIBRARY');

-- CreateEnum
CREATE TYPE "AiLibraryState" AS ENUM ('WAITING', 'WRITING', 'CHECKING', 'REVIEWING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AiLibraryItemKind" AS ENUM ('HINT', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "AiLibraryItemOrigin" AS ENUM ('AI', 'COPY', 'GROWN', 'STAFF');

-- CreateEnum
CREATE TYPE "AiLibraryItemState" AS ENUM ('CHECKING', 'ACTIVE', 'HIDDEN', 'REJECTED');

-- CreateEnum
CREATE TYPE "AiLibraryCheckRole" AS ENUM ('SOLUTION', 'CORRECT', 'WRONG');

-- CreateTable
CREATE TABLE "ai_help_replies" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "class_id" UUID,
    "submission_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "grading_revision" INTEGER NOT NULL,
    "level" SMALLINT NOT NULL,
    "locale" VARCHAR(2) NOT NULL,
    "status" "AiHelpStatus" NOT NULL DEFAULT 'PENDING',
    "reply" VARCHAR(2000),
    "analysis" JSONB,
    "failure_code" VARCHAR(20),
    "library_item_id" UUID,
    "model" VARCHAR(80),
    "prompt_version" VARCHAR(20) NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cost_micros" INTEGER,
    "latency_ms" INTEGER,
    "reported_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_help_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_months" (
    "month" DATE NOT NULL,
    "kind" "AiUsageKind" NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" BIGINT NOT NULL DEFAULT 0,
    "output_tokens" BIGINT NOT NULL DEFAULT 0,
    "cost_micros" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_months_pkey" PRIMARY KEY ("month","kind")
);

-- CreateTable
CREATE TABLE "ai_libraries" (
    "material_id" UUID NOT NULL,
    "content_digest" VARCHAR(64) NOT NULL,
    "grading_revision" INTEGER NOT NULL,
    "state" "AiLibraryState" NOT NULL DEFAULT 'WAITING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_id" UUID,
    "lease_until" TIMESTAMPTZ(6),
    "last_error_code" VARCHAR(40),
    "correct_programs" JSONB NOT NULL DEFAULT '[]',
    "model" VARCHAR(80),
    "prompt_version" VARCHAR(20),
    "compared_at" TIMESTAMPTZ(6) NOT NULL,
    "grown_at" TIMESTAMPTZ(6),
    "ready_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_libraries_pkey" PRIMARY KEY ("material_id")
);

-- CreateTable
CREATE TABLE "ai_library_items" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "kind" "AiLibraryItemKind" NOT NULL,
    "position" INTEGER NOT NULL,
    "label" VARCHAR(120) NOT NULL DEFAULT '',
    "text_ko" VARCHAR(400) NOT NULL,
    "text_en" VARCHAR(400) NOT NULL,
    "wrong_program" TEXT,
    "public_outputs" JSONB,
    "fingerprint" TEXT,
    "origin" "AiLibraryItemOrigin" NOT NULL DEFAULT 'AI',
    "state" "AiLibraryItemState" NOT NULL DEFAULT 'CHECKING',
    "reject_reason" VARCHAR(300),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_library_reports" (
    "item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_library_reports_pkey" PRIMARY KEY ("item_id","user_id")
);

-- CreateTable
CREATE TABLE "ai_library_checks" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "item_id" UUID,
    "role" "AiLibraryCheckRole" NOT NULL,
    "label" VARCHAR(120) NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "execution_queue" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
    "public_outputs" JSONB,
    "fingerprint" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_library_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_help_replies_user_id_created_at_idx" ON "ai_help_replies"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_help_replies_user_id_material_id_created_at_idx" ON "ai_help_replies"("user_id", "material_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_help_replies_submission_id_idx" ON "ai_help_replies"("submission_id");

-- CreateIndex
CREATE INDEX "ai_help_replies_material_id_created_at_idx" ON "ai_help_replies"("material_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_help_replies_user_id_request_id_key" ON "ai_help_replies"("user_id", "request_id");

-- CreateIndex
CREATE INDEX "ai_libraries_state_next_attempt_at_idx" ON "ai_libraries"("state", "next_attempt_at");

-- CreateIndex
CREATE INDEX "ai_libraries_content_digest_state_idx" ON "ai_libraries"("content_digest", "state");

-- CreateIndex
CREATE INDEX "ai_library_items_material_id_state_idx" ON "ai_library_items"("material_id", "state");

-- CreateIndex
CREATE INDEX "ai_library_checks_material_id_status_idx" ON "ai_library_checks"("material_id", "status");

-- CreateIndex
CREATE INDEX "ai_library_checks_status_created_at_idx" ON "ai_library_checks"("status", "created_at");

-- AddForeignKey
ALTER TABLE "ai_help_replies" ADD CONSTRAINT "ai_help_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_help_replies" ADD CONSTRAINT "ai_help_replies_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_help_replies" ADD CONSTRAINT "ai_help_replies_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_help_replies" ADD CONSTRAINT "ai_help_replies_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_help_replies" ADD CONSTRAINT "ai_help_replies_library_item_id_fkey" FOREIGN KEY ("library_item_id") REFERENCES "ai_library_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_libraries" ADD CONSTRAINT "ai_libraries_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "programming_exercises"("material_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_library_items" ADD CONSTRAINT "ai_library_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "ai_libraries"("material_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_library_reports" ADD CONSTRAINT "ai_library_reports_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ai_library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_library_reports" ADD CONSTRAINT "ai_library_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_library_checks" ADD CONSTRAINT "ai_library_checks_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "ai_libraries"("material_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_library_checks" ADD CONSTRAINT "ai_library_checks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ai_library_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Server only: replies are a student's own, and library programs are answers.
-- Browser Supabase clients have no direct access.
ALTER TABLE "ai_help_replies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_usage_months" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_libraries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_library_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_library_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_library_checks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ai_help_replies", "ai_usage_months", "ai_libraries", "ai_library_items", "ai_library_reports", "ai_library_checks" FROM anon, authenticated;

-- Operators read the few reported replies without scanning the rest.
CREATE INDEX "ai_help_replies_reported_idx" ON "ai_help_replies"("reported_at") WHERE "reported_at" IS NOT NULL;
