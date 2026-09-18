CREATE TYPE "HelpRequestStatus" AS ENUM ('WAITING', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');
CREATE TABLE "student_help_requests" (
  "id" UUID NOT NULL,
  "academy_id" UUID NOT NULL REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "class_id" UUID NOT NULL REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "student_membership_ref" UUID NOT NULL,
  "student_membership_id" UUID REFERENCES "academy_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "material_ref" UUID NOT NULL,
  "material_id" UUID REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "teacher_membership_ref" UUID,
  "teacher_membership_id" UUID REFERENCES "academy_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "status" "HelpRequestStatus" NOT NULL DEFAULT 'WAITING',
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMPTZ(6), "closed_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  "closed_by_ref" UUID, "close_reason" TEXT,
  CONSTRAINT "student_help_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "help_request_claim_state" CHECK ((status = 'IN_PROGRESS') = (teacher_membership_ref IS NOT NULL AND claimed_at IS NOT NULL)),
  CONSTRAINT "help_request_closed_state" CHECK ((status IN ('RESOLVED', 'CANCELLED')) = (closed_at IS NOT NULL))
);
CREATE UNIQUE INDEX "help_request_one_active_per_class" ON "student_help_requests" ("academy_id", "class_id", "student_membership_ref") WHERE "status" IN ('WAITING', 'IN_PROGRESS');
CREATE INDEX "help_requests_class_queue_idx" ON "student_help_requests" ("academy_id", "class_id", "status", "requested_at", "id");
CREATE INDEX "help_requests_student_active_idx" ON "student_help_requests" ("student_membership_ref", "class_id", "status");
CREATE TABLE "help_request_receipts" (
  "actor_ref" UUID NOT NULL, "key" UUID NOT NULL, "fingerprint" TEXT NOT NULL,
  "result" JSONB NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("actor_ref", "key")
);
