-- Teacher live monitoring: the durable half of a class-scoped monitoring
-- session. New tables and one nullable column only.
--
-- Nothing is back-filled. v1's collaboration_sessions mixed drafts with
-- watching, so importing it would both invent monitoring history and hand a
-- teacher access nobody assigned. Existing drafts gain a collaboration row
-- lazily, the first time somebody actually collaborates on them.

CREATE TYPE "AcademyFeature" AS ENUM ('TEACHER_LIVE_MONITORING');

CREATE TYPE "MonitoringVisitEndReason" AS ENUM (
  'TEACHER_LEFT',
  'WATCH_REPLACED',
  'STUDENT_LEFT',
  'ASSIGNMENT_CHANGED',
  'CLASS_ARCHIVED',
  'ENROLLMENT_REMOVED',
  'MEMBERSHIP_INACTIVE',
  'ROLE_CHANGED',
  'MATERIAL_UNAVAILABLE',
  'CONNECTION_EXPIRED',
  'FEATURE_DISABLED'
);

-- A missing row means off, so every existing academy starts outside the
-- rollout and no class becomes monitorable by deploying this migration.
CREATE TABLE "academy_feature_flags" (
  "academy_id" UUID NOT NULL,
  "feature" "AcademyFeature" NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "academy_feature_flags_pkey" PRIMARY KEY ("academy_id", "feature")
);

ALTER TABLE "academy_feature_flags"
  ADD CONSTRAINT "academy_feature_flags_academy_id_fkey"
  FOREIGN KEY ("academy_id") REFERENCES "academies" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Contextual history for an offline roster label. Nullable because an
-- enrollment that has never opened a lesson has no honest value to report, and
-- CURRENT_TIMESTAMP here would make every existing student look recently seen.
ALTER TABLE "class_enrollments" ADD COLUMN "last_learning_seen_at" TIMESTAMPTZ(6);

-- One CRDT state per draft, created on first live collaboration. Cascades with
-- the draft: the code snapshot lives on exercise_drafts, and this row is only
-- the recovery state behind it.
CREATE TABLE "exercise_collaboration_documents" (
  "draft_id" UUID NOT NULL,
  "yjs_state" BYTEA NOT NULL,
  "snapshot_version" BIGINT NOT NULL DEFAULT 0,
  "code_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "exercise_collaboration_documents_pkey" PRIMARY KEY ("draft_id")
);

ALTER TABLE "exercise_collaboration_documents"
  ADD CONSTRAINT "exercise_collaboration_documents_draft_id_fkey"
  FOREIGN KEY ("draft_id") REFERENCES "exercise_drafts" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Access accountability: who could see this student, and when. There is no
-- column for code, cursors, pointers, feedback text, or grading internals.
CREATE TABLE "teacher_monitoring_visits" (
  "id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "class_id" UUID NOT NULL,
  "teacher_membership_id" UUID,
  "student_membership_id" UUID,
  "teacher_membership_ref" UUID NOT NULL,
  "student_membership_ref" UUID NOT NULL,
  "material_id" UUID,
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMPTZ(6),
  "end_reason" "MonitoringVisitEndReason",
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "teacher_monitoring_visits_pkey" PRIMARY KEY ("id")
);

-- "Who watched this student", newest first.
CREATE INDEX "teacher_monitoring_visits_student_membership_ref_started_at_idx"
  ON "teacher_monitoring_visits" ("student_membership_ref", "started_at" DESC);
CREATE INDEX "teacher_monitoring_visits_teacher_membership_ref_started_at_idx"
  ON "teacher_monitoring_visits" ("teacher_membership_ref", "started_at" DESC);
-- Finds the still-open visits, which is what revocation has to close.
CREATE INDEX "teacher_monitoring_visits_class_id_ended_at_idx"
  ON "teacher_monitoring_visits" ("class_id", "ended_at");
CREATE UNIQUE INDEX "teacher_monitoring_visits_one_open_per_teacher_idx"
  ON "teacher_monitoring_visits" ("teacher_membership_ref")
  WHERE "ended_at" IS NULL;

-- Academy and class RESTRICT: their lifecycle is archive, not delete, and a
-- deleted class must not silently erase who had access to its students.
ALTER TABLE "teacher_monitoring_visits"
  ADD CONSTRAINT "teacher_monitoring_visits_academy_id_fkey"
  FOREIGN KEY ("academy_id") REFERENCES "academies" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "teacher_monitoring_visits"
  ADD CONSTRAINT "teacher_monitoring_visits_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- SET NULL on the live membership relations, while the immutable *_ref columns
-- above keep the record readable after the member is gone.
ALTER TABLE "teacher_monitoring_visits"
  ADD CONSTRAINT "teacher_monitoring_visits_teacher_membership_id_fkey"
  FOREIGN KEY ("teacher_membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "teacher_monitoring_visits"
  ADD CONSTRAINT "teacher_monitoring_visits_student_membership_id_fkey"
  FOREIGN KEY ("student_membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "teacher_monitoring_visits"
  ADD CONSTRAINT "teacher_monitoring_visits_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "materials" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Durable written feedback. The body lives here and nowhere else: it is kept
-- out of audit payloads and operational logs on purpose.
CREATE TABLE "teacher_feedback" (
  "id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "class_id" UUID NOT NULL,
  "teacher_membership_id" UUID,
  "student_membership_id" UUID,
  "teacher_membership_ref" UUID NOT NULL,
  "student_membership_ref" UUID NOT NULL,
  "material_id" UUID,
  "monitoring_visit_id" UUID,
  "idempotency_key" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "teacher_feedback_pkey" PRIMARY KEY ("id")
);

-- Scoped to the author: two teachers cannot collide on a key, and one
-- teacher's retry cannot overwrite another teacher's message.
CREATE UNIQUE INDEX "teacher_feedback_teacher_membership_ref_idempotency_key_key"
  ON "teacher_feedback" ("teacher_membership_ref", "idempotency_key");

CREATE INDEX "teacher_feedback_student_membership_ref_created_at_idx"
  ON "teacher_feedback" ("student_membership_ref", "created_at" DESC);
CREATE INDEX "teacher_feedback_student_material_created_at_idx"
  ON "teacher_feedback" ("student_membership_ref", "material_id", "created_at" DESC);

ALTER TABLE "teacher_feedback"
  ADD CONSTRAINT "teacher_feedback_academy_id_fkey"
  FOREIGN KEY ("academy_id") REFERENCES "academies" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "teacher_feedback"
  ADD CONSTRAINT "teacher_feedback_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "teacher_feedback"
  ADD CONSTRAINT "teacher_feedback_teacher_membership_id_fkey"
  FOREIGN KEY ("teacher_membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "teacher_feedback"
  ADD CONSTRAINT "teacher_feedback_student_membership_id_fkey"
  FOREIGN KEY ("student_membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "teacher_feedback"
  ADD CONSTRAINT "teacher_feedback_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "materials" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "teacher_feedback"
  ADD CONSTRAINT "teacher_feedback_monitoring_visit_id_fkey"
  FOREIGN KEY ("monitoring_visit_id") REFERENCES "teacher_monitoring_visits" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
