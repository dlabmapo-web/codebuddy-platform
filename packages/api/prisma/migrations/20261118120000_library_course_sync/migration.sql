-- CreateEnum
CREATE TYPE "LibrarySyncNodeKind" AS ENUM ('COURSE', 'MODULE', 'LECTURE', 'MATERIAL');

-- CreateEnum
CREATE TYPE "LibrarySyncLinkMethod" AS ENUM ('ADOPTED', 'LEGACY_LINKED');

-- CreateEnum
CREATE TYPE "LibrarySyncStatus" AS ENUM ('IDLE', 'PENDING', 'RUNNING', 'FAILED', 'PAUSED');

-- CreateEnum
CREATE TYPE "LibrarySyncLinkState" AS ENUM ('LINKED', 'LOCAL_DELETED', 'ARCHIVED', 'DETACHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "LibrarySyncLinkEvidence" AS ENUM ('ADOPTED', 'EXTERNAL_KEY', 'ASSET_IDENTITY', 'FINGERPRINT', 'PROVENANCE_UNIQUE', 'MANUAL');

-- CreateEnum
CREATE TYPE "LibrarySyncBaseState" AS ENUM ('VALUE', 'ABSENT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LibrarySyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "LibrarySyncConflictKind" AS ENUM ('CONCURRENT_EDIT', 'UNKNOWN_BASE', 'REMOVED_UPSTREAM_EDITED_LOCALLY', 'EDITED_UPSTREAM_DELETED_LOCALLY', 'REMOVED_UPSTREAM_HAS_LOCAL_CONTENT', 'PARENT_MISSING', 'PLACEMENT', 'INVALID_RESULT', 'AMBIGUOUS_LINK');

-- CreateEnum
CREATE TYPE "LibrarySyncConflictStatus" AS ENUM ('OPEN', 'RESOLVED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "LibrarySyncResolution" AS ENUM ('ACCEPT_LIBRARY', 'KEEP_ACADEMY', 'MANUAL', 'CONVERGED');

-- CreateEnum
CREATE TYPE "LibrarySyncOutcome" AS ENUM ('APPLIED', 'KEPT', 'CONVERGED', 'CONFLICT', 'ADDED', 'REMOVED', 'ARCHIVED', 'MOVED', 'RESTORED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "LibrarySyncAssetKind" AS ENUM ('PDF', 'VIDEO', 'CAPTION', 'MANUAL', 'LESSON_IMAGE');

-- CreateEnum
CREATE TYPE "LibrarySyncAssetOwner" AS ENUM ('RELEASE', 'BASE', 'CONFLICT', 'RESOLUTION');

-- AlterEnum
ALTER TYPE "AcademyFeature" ADD VALUE 'LIBRARY_COURSE_SYNC';

-- AlterTable
ALTER TABLE "exercise_hints" ADD COLUMN     "sync_key" UUID NOT NULL DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "exercise_test_cases" ADD COLUMN     "sync_key" UUID NOT NULL DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "programming_exercise_solutions" ADD COLUMN     "sync_key" UUID NOT NULL DEFAULT gen_random_uuid();

-- CreateTable
CREATE TABLE "library_releases" (
    "id" UUID NOT NULL,
    "library_course_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "library_content_revision" INTEGER NOT NULL,
    "language" "CourseLanguage" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "published_by_user_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "node_count" INTEGER NOT NULL,
    "summary" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "library_releases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_release_nodes" (
    "release_id" UUID NOT NULL,
    "node_key" UUID NOT NULL,
    "kind" "LibrarySyncNodeKind" NOT NULL,
    "material_type" "MaterialType",
    "parent_key" UUID,
    "ordinal" INTEGER NOT NULL,
    "unit_hashes" JSONB NOT NULL,

    CONSTRAINT "library_release_nodes_pkey" PRIMARY KEY ("release_id","node_key")
);

-- CreateTable
CREATE TABLE "library_sync_values" (
    "hash" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_sync_values_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "course_sync_states" (
    "course_id" UUID NOT NULL,
    "library_course_id" UUID NOT NULL,
    "link_method" "LibrarySyncLinkMethod" NOT NULL,
    "base_release_id" UUID,
    "applied_release_number" INTEGER NOT NULL DEFAULT 0,
    "target_release_id" UUID,
    "target_release_number" INTEGER NOT NULL DEFAULT 0,
    "status" "LibrarySyncStatus" NOT NULL DEFAULT 'IDLE',
    "paused_at" TIMESTAMPTZ(6),
    "open_conflict_count" INTEGER NOT NULL DEFAULT 0,
    "divergent_unit_count" INTEGER NOT NULL DEFAULT 0,
    "last_synced_content_revision" INTEGER,
    "last_run_at" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_sync_states_pkey" PRIMARY KEY ("course_id")
);

-- CreateTable
CREATE TABLE "library_sync_links" (
    "copy_course_id" UUID NOT NULL,
    "node_key" UUID NOT NULL,
    "kind" "LibrarySyncNodeKind" NOT NULL,
    "local_id" UUID,
    "state" "LibrarySyncLinkState" NOT NULL,
    "evidence" "LibrarySyncLinkEvidence" NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "archived_visibility" BOOLEAN,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_sync_links_pkey" PRIMARY KEY ("copy_course_id","node_key")
);

-- CreateTable
CREATE TABLE "library_sync_bases" (
    "copy_course_id" UUID NOT NULL,
    "node_key" UUID NOT NULL,
    "unit_key" TEXT NOT NULL,
    "base_state" "LibrarySyncBaseState" NOT NULL,
    "base_hash" TEXT,

    CONSTRAINT "library_sync_bases_pkey" PRIMARY KEY ("copy_course_id","node_key","unit_key")
);

-- CreateTable
CREATE TABLE "library_sync_jobs" (
    "id" UUID NOT NULL,
    "copy_course_id" UUID NOT NULL,
    "target_release_id" UUID NOT NULL,
    "target_release_number" INTEGER NOT NULL,
    "status" "LibrarySyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_id" UUID,
    "lease_until" TIMESTAMPTZ(6),
    "last_error_code" TEXT,
    "summary" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "library_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_sync_conflicts" (
    "id" UUID NOT NULL,
    "copy_course_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "node_key" UUID NOT NULL,
    "unit_key" TEXT NOT NULL,
    "kind" "LibrarySyncConflictKind" NOT NULL,
    "base_state" "LibrarySyncBaseState" NOT NULL,
    "base_hash" TEXT,
    "ours_hash" TEXT,
    "theirs_hash" TEXT,
    "theirs_release_id" UUID NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "status" "LibrarySyncConflictStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" "LibrarySyncResolution",
    "resolved_hash" TEXT,
    "resolved_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "library_sync_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_sync_changes" (
    "id" UUID NOT NULL,
    "job_id" UUID,
    "copy_course_id" UUID NOT NULL,
    "release_id" UUID NOT NULL,
    "node_key" UUID NOT NULL,
    "unit_key" TEXT NOT NULL,
    "outcome" "LibrarySyncOutcome" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_sync_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_sync_asset_references" (
    "id" UUID NOT NULL,
    "owner_kind" "LibrarySyncAssetOwner" NOT NULL,
    "owner_id" UUID NOT NULL,
    "asset_kind" "LibrarySyncAssetKind" NOT NULL,
    "asset_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_sync_asset_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_sync_resolution_receipts" (
    "copy_course_id" UUID NOT NULL,
    "request_key" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "request_hash" TEXT NOT NULL,
    "group_id" UUID NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_sync_resolution_receipts_pkey" PRIMARY KEY ("copy_course_id","request_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_releases_library_course_id_number_key" ON "library_releases"("library_course_id", "number");

-- CreateIndex
CREATE INDEX "course_sync_states_library_course_id_idx" ON "course_sync_states"("library_course_id");

-- CreateIndex
CREATE INDEX "library_sync_links_copy_course_id_local_id_idx" ON "library_sync_links"("copy_course_id", "local_id");

-- CreateIndex
CREATE INDEX "library_sync_jobs_status_next_attempt_at_idx" ON "library_sync_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "library_sync_jobs_copy_course_id_created_at_idx" ON "library_sync_jobs"("copy_course_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "library_sync_conflicts_copy_course_id_status_idx" ON "library_sync_conflicts"("copy_course_id", "status");

-- CreateIndex
CREATE INDEX "library_sync_conflicts_group_id_idx" ON "library_sync_conflicts"("group_id");

-- CreateIndex
CREATE INDEX "library_sync_changes_copy_course_id_created_at_idx" ON "library_sync_changes"("copy_course_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "library_sync_asset_references_asset_kind_asset_id_idx" ON "library_sync_asset_references"("asset_kind", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_sync_asset_references_owner_kind_owner_id_asset_kin_key" ON "library_sync_asset_references"("owner_kind", "owner_id", "asset_kind", "asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_hints_exercise_material_id_sync_key_key" ON "exercise_hints"("exercise_material_id", "sync_key");

-- CreateIndex
CREATE UNIQUE INDEX "exercise_test_cases_exercise_material_id_sync_key_key" ON "exercise_test_cases"("exercise_material_id", "sync_key");

-- CreateIndex
CREATE UNIQUE INDEX "programming_exercise_solutions_material_id_sync_key_key" ON "programming_exercise_solutions"("material_id", "sync_key");

-- AddForeignKey
ALTER TABLE "library_releases" ADD CONSTRAINT "library_releases_library_course_id_fkey" FOREIGN KEY ("library_course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_releases" ADD CONSTRAINT "library_releases_published_by_user_id_fkey" FOREIGN KEY ("published_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_release_nodes" ADD CONSTRAINT "library_release_nodes_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "library_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sync_states" ADD CONSTRAINT "course_sync_states_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sync_states" ADD CONSTRAINT "course_sync_states_library_course_id_fkey" FOREIGN KEY ("library_course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sync_states" ADD CONSTRAINT "course_sync_states_base_release_id_fkey" FOREIGN KEY ("base_release_id") REFERENCES "library_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sync_states" ADD CONSTRAINT "course_sync_states_target_release_id_fkey" FOREIGN KEY ("target_release_id") REFERENCES "library_releases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_sync_links" ADD CONSTRAINT "library_sync_links_copy_course_id_fkey" FOREIGN KEY ("copy_course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_sync_bases" ADD CONSTRAINT "library_sync_bases_copy_course_id_fkey" FOREIGN KEY ("copy_course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_sync_jobs" ADD CONSTRAINT "library_sync_jobs_copy_course_id_fkey" FOREIGN KEY ("copy_course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_sync_jobs" ADD CONSTRAINT "library_sync_jobs_target_release_id_fkey" FOREIGN KEY ("target_release_id") REFERENCES "library_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_sync_conflicts" ADD CONSTRAINT "library_sync_conflicts_copy_course_id_fkey" FOREIGN KEY ("copy_course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_sync_conflicts" ADD CONSTRAINT "library_sync_conflicts_theirs_release_id_fkey" FOREIGN KEY ("theirs_release_id") REFERENCES "library_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_sync_conflicts" ADD CONSTRAINT "library_sync_conflicts_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_sync_changes" ADD CONSTRAINT "library_sync_changes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "library_sync_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_sync_changes" ADD CONSTRAINT "library_sync_changes_copy_course_id_fkey" FOREIGN KEY ("copy_course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_sync_resolution_receipts" ADD CONSTRAINT "library_sync_resolution_receipts_copy_course_id_fkey" FOREIGN KEY ("copy_course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_sync_resolution_receipts" ADD CONSTRAINT "library_sync_resolution_receipts_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: Prisma cannot express partial uniques or CHECK constraints.

-- One link per local row of a kind, while the row exists.
CREATE UNIQUE INDEX "library_sync_links_local_row_key"
  ON "library_sync_links" ("copy_course_id", "kind", "local_id")
  WHERE "local_id" IS NOT NULL;

-- A live link names a row; a tombstone does not.
ALTER TABLE "library_sync_links" ADD CONSTRAINT "library_sync_links_local_id_state_check"
  CHECK (("state" IN ('LINKED', 'ARCHIVED', 'DETACHED')) = ("local_id" IS NOT NULL));

-- A base hash exactly when the base is a value; ABSENT and UNKNOWN differ.
ALTER TABLE "library_sync_bases" ADD CONSTRAINT "library_sync_bases_hash_state_check"
  CHECK (("base_state" = 'VALUE') = ("base_hash" IS NOT NULL));
ALTER TABLE "library_sync_conflicts" ADD CONSTRAINT "library_sync_conflicts_hash_state_check"
  CHECK (("base_state" = 'VALUE') = ("base_hash" IS NOT NULL));

-- One pending target and one running job per copy: a newer release retargets
-- the pending job, and per-copy work never runs twice at once.
CREATE UNIQUE INDEX "library_sync_jobs_one_pending_key"
  ON "library_sync_jobs" ("copy_course_id") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "library_sync_jobs_one_running_key"
  ON "library_sync_jobs" ("copy_course_id") WHERE "status" = 'RUNNING';

-- One open decision per unit of a copy.
CREATE UNIQUE INDEX "library_sync_conflicts_one_open_key"
  ON "library_sync_conflicts" ("copy_course_id", "node_key", "unit_key")
  WHERE "status" = 'OPEN';

ALTER TABLE "library_releases" ADD CONSTRAINT "library_releases_number_check" CHECK ("number" > 0);
ALTER TABLE "library_releases" ADD CONSTRAINT "library_releases_note_length_check" CHECK (char_length("note") <= 500);
ALTER TABLE "course_sync_states" ADD CONSTRAINT "course_sync_states_release_order_check"
  CHECK ("applied_release_number" >= 0 AND "target_release_number" >= "applied_release_number");
ALTER TABLE "course_sync_states" ADD CONSTRAINT "course_sync_states_not_self_check"
  CHECK ("course_id" <> "library_course_id");

-- Service-only: snapshot values carry answer keys, solutions and hidden tests.
ALTER TABLE "library_releases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_release_nodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_sync_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "course_sync_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_sync_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_sync_bases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_sync_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_sync_conflicts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_sync_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_sync_asset_references" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "library_sync_resolution_receipts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "library_releases", "library_release_nodes", "library_sync_values",
  "course_sync_states", "library_sync_links", "library_sync_bases", "library_sync_jobs",
  "library_sync_conflicts", "library_sync_changes", "library_sync_asset_references",
  "library_sync_resolution_receipts" FROM anon, authenticated;
