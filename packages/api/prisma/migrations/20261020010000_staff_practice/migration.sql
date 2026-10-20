-- Staff practice is deliberately separate from student submissions and progress.
CREATE TABLE "staff_practice_drafts" (
  "id" UUID NOT NULL, "academy_id" UUID NOT NULL, "user_id" UUID NOT NULL,
  "material_id" UUID NOT NULL, "context" TEXT NOT NULL DEFAULT 'live', "code" TEXT NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "staff_practice_drafts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "staff_practice_attempts" (
  "id" UUID NOT NULL, "academy_id" UUID NOT NULL, "user_id" UUID NOT NULL,
  "material_id" UUID NOT NULL, "context" TEXT NOT NULL DEFAULT 'live', "request_id" UUID NOT NULL,
  "code" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "result" JSONB,
  "status" "SubmissionStatus" NOT NULL DEFAULT 'QUEUED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMPTZ(6), "graded_at" TIMESTAMPTZ(6),
  CONSTRAINT "staff_practice_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "staff_practice_drafts_academy_id_user_id_material_id_context_key" ON "staff_practice_drafts" ("academy_id", "user_id", "material_id", "context");
CREATE UNIQUE INDEX "staff_practice_attempts_academy_id_user_id_request_id_key" ON "staff_practice_attempts" ("academy_id", "user_id", "request_id");
CREATE INDEX "staff_practice_attempts_academy_id_user_id_material_id_context_idx" ON "staff_practice_attempts" ("academy_id", "user_id", "material_id", "context", "created_at" DESC);
CREATE INDEX "staff_practice_attempts_status_created_at_idx" ON "staff_practice_attempts" ("status", "created_at");
ALTER TABLE "staff_practice_drafts" ADD CONSTRAINT "staff_practice_drafts_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_practice_drafts" ADD CONSTRAINT "staff_practice_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_practice_drafts" ADD CONSTRAINT "staff_practice_drafts_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_practice_attempts" ADD CONSTRAINT "staff_practice_attempts_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_practice_attempts" ADD CONSTRAINT "staff_practice_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_practice_attempts" ADD CONSTRAINT "staff_practice_attempts_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
