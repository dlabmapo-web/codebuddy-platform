-- Team Lead Excel problem import: stable keys, course revisions, and sessions.
--
-- Follows docs/superpowers/specs/2026-08-24-team-lead-excel-problem-import-
-- design.md §9.1–§9.3.
--
-- Three ideas shape what follows.
--
-- Identity is a key, not a title. The v1 importer matched hierarchy records by
-- title and position, which is why re-running it produced duplicates. Modules
-- and lectures gain the stable key problems already had, backfilled with UUIDs
-- so existing content is addressable from a workbook on the first export.
--
-- A course knows when its content moved. `courses.updated_at` does not change
-- when a test case four levels down is edited, so a preview validated against
-- it would survive an edit that invalidated it. `content_revision` is bumped by
-- every content mutation in the same transaction as the mutation.
--
-- A preview is durable and single-use. The plan a team lead approved is stored
-- verbatim and claimed with a conditional status update, so two tabs holding
-- one preview produce one import.

/* ---------------------------------------------------------- course revision */

ALTER TABLE "courses"
  ADD COLUMN "content_revision" INTEGER NOT NULL DEFAULT 1;

/* ------------------------------------------------------------- stable keys */

ALTER TABLE "course_modules" ADD COLUMN "external_key" TEXT;
ALTER TABLE "lectures" ADD COLUMN "external_key" TEXT;

-- Backfilled as uppercase UUIDs, which is already the canonical form the
-- importer normalizes to: NFKC leaves ASCII hex alone, there is nothing to
-- trim, and `-` is one of the three punctuation marks a key may contain. An
-- exported key therefore round-trips through Excel unchanged.
UPDATE "course_modules"
  SET "external_key" = upper(gen_random_uuid()::text)
  WHERE "external_key" IS NULL;

UPDATE "lectures"
  SET "external_key" = upper(gen_random_uuid()::text)
  WHERE "external_key" IS NULL;

ALTER TABLE "course_modules" ALTER COLUMN "external_key" SET NOT NULL;
ALTER TABLE "lectures" ALTER COLUMN "external_key" SET NOT NULL;

CREATE UNIQUE INDEX "course_modules_course_id_external_key_key"
  ON "course_modules" ("course_id", "external_key");

CREATE INDEX "lectures_external_key_idx" ON "lectures" ("external_key");

/* ------------------------------------------- existing problem key normalization */

-- §9.1 — problem keys already exist and were never normalized, so two of them
-- may differ only by case or by whitespace. Normalizing blindly would merge two
-- identities into one and hand a team lead an import that silently updates the
-- wrong problem.
--
-- The scan runs first and aborts the migration if it finds a collision. A
-- deploy that stops with a readable message is recoverable; a deploy that
-- quietly merged two problems is not.
DO $$
DECLARE
  collision_count INTEGER;
BEGIN
  SELECT count(*) INTO collision_count
  FROM (
    SELECT cm."course_id", upper(btrim(pe."external_key")) AS normalized_key
    FROM "programming_exercises" pe
    JOIN "materials" m ON m."id" = pe."material_id"
    JOIN "lectures" l ON l."id" = m."lecture_id"
    JOIN "course_modules" cm ON cm."id" = l."course_module_id"
    GROUP BY cm."course_id", upper(btrim(pe."external_key"))
    HAVING count(*) > 1
  ) AS collisions;

  IF collision_count > 0 THEN
    RAISE EXCEPTION
      'Cannot normalize programming exercise keys: % course-scoped collisions. Rename the duplicates before migrating.',
      collision_count;
  END IF;
END $$;

UPDATE "programming_exercises"
  SET "external_key" = upper(btrim("external_key"))
  WHERE "external_key" <> upper(btrim("external_key"));

/* ------------------------------------------------------------- session table */

CREATE TYPE "ContentImportStatus" AS ENUM (
  'PREVIEW_READY',
  'COMMITTING',
  'COMPLETED',
  'EXPIRED',
  'FAILED'
);

CREATE TABLE "content_import_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "academy_id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "original_filename" TEXT NOT NULL,
  "checksum_sha256" TEXT NOT NULL,
  "template_version" INTEGER NOT NULL,
  "status" "ContentImportStatus" NOT NULL DEFAULT 'PREVIEW_READY',
  "create_count" INTEGER NOT NULL,
  "update_count" INTEGER NOT NULL,
  "unchanged_count" INTEGER NOT NULL,
  "warning_count" INTEGER NOT NULL,
  "conflict_count" INTEGER NOT NULL,
  "error_count" INTEGER NOT NULL,
  "plan" JSONB NOT NULL,
  "captured_content_revision" INTEGER NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "committed_at" TIMESTAMPTZ(6),
  "result" JSONB,
  "failure_code" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "content_import_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_import_sessions_course_id_idempotency_key_key"
  ON "content_import_sessions" ("course_id", "idempotency_key");

CREATE INDEX "content_import_sessions_academy_id_course_id_status_created_idx"
  ON "content_import_sessions" ("academy_id", "course_id", "status", "created_at");

CREATE INDEX "content_import_sessions_expires_at_idx"
  ON "content_import_sessions" ("expires_at");

-- Cascade from academy and course, restrict from actor. Deleting a course
-- should take its abandoned previews with it; deleting the person who ran an
-- import should not be possible while the audit trail names them.
ALTER TABLE "content_import_sessions"
  ADD CONSTRAINT "content_import_sessions_academy_id_fkey"
  FOREIGN KEY ("academy_id") REFERENCES "academies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_import_sessions"
  ADD CONSTRAINT "content_import_sessions_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_import_sessions"
  ADD CONSTRAINT "content_import_sessions_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
