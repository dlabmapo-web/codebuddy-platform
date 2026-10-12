-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MaterialType" ADD VALUE 'TURTLE_EXERCISE';
ALTER TYPE "MaterialType" ADD VALUE 'WRITTEN_RESPONSE';

-- CreateTable
CREATE TABLE "manual_materials" (
    "material_id" UUID NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "files" JSONB NOT NULL DEFAULT '{}',
    "entry_point" TEXT NOT NULL DEFAULT 'main.py',
    "assets" JSONB NOT NULL DEFAULT '[]',
    "solution_files" JSONB,
    "hint" TEXT NOT NULL DEFAULT '',
    "width" INTEGER NOT NULL DEFAULT 1024,
    "height" INTEGER NOT NULL DEFAULT 640,
    "time_limit_seconds" INTEGER NOT NULL DEFAULT 1800,
    "memory_limit_mb" INTEGER NOT NULL DEFAULT 512,
    "runtime_version" TEXT NOT NULL DEFAULT 'cpython-tk-v1',
    "submit_enabled" BOOLEAN NOT NULL DEFAULT true,
    "include_in_score" BOOLEAN NOT NULL DEFAULT false,
    "maximum_hundredths" INTEGER NOT NULL DEFAULT 10000,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "manual_materials_pkey" PRIMARY KEY ("material_id")
);

-- CreateTable
CREATE TABLE "manual_drafts" (
    "material_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "files" JSONB NOT NULL DEFAULT '{}',
    "answer" TEXT NOT NULL DEFAULT '',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "manual_drafts_pkey" PRIMARY KEY ("material_id","user_id")
);

-- CreateTable
CREATE TABLE "manual_submissions" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "files" JSONB NOT NULL,
    "answer" TEXT NOT NULL DEFAULT '',
    "profile" JSONB NOT NULL,
    "revision" INTEGER NOT NULL,
    "maximum_hundredths" INTEGER NOT NULL,
    "include_in_score" BOOLEAN NOT NULL,
    "request_key" UUID NOT NULL,
    "review_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_reviews" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "score_hundredths" INTEGER NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "feedback" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_assets" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "manual_submissions_material_id_class_id_user_id_created_at_idx" ON "manual_submissions"("material_id", "class_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "manual_submissions_user_id_request_key_key" ON "manual_submissions"("user_id", "request_key");

-- CreateIndex
CREATE UNIQUE INDEX "manual_reviews_submission_id_version_key" ON "manual_reviews"("submission_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "manual_assets_object_key_key" ON "manual_assets"("object_key");

-- CreateIndex
CREATE INDEX "manual_assets_academy_id_course_id_idx" ON "manual_assets"("academy_id", "course_id");

-- AddForeignKey
ALTER TABLE "manual_materials" ADD CONSTRAINT "manual_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_drafts" ADD CONSTRAINT "manual_drafts_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_drafts" ADD CONSTRAINT "manual_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_submissions" ADD CONSTRAINT "manual_submissions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_submissions" ADD CONSTRAINT "manual_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_submissions" ADD CONSTRAINT "manual_submissions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_reviews" ADD CONSTRAINT "manual_reviews_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "manual_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_reviews" ADD CONSTRAINT "manual_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

