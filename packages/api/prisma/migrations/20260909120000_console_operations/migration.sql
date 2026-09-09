-- Console operations: a maintenance operation an operator dispatches onto the
-- queue, and the record of what it did.
--
-- Everything here is additive — a new table, a new nullable column, new indexes
-- — so the image running before this migration is still correct against the
-- schema after it. `deploy.sh` applies migrations ahead of the new containers
-- and a failed release puts the previous images back without reversing them.

CREATE TYPE "PlatformOperation" AS ENUM ('REGRADE_STALE_SUBMISSIONS');

CREATE TYPE "PlatformOperationStatus" AS ENUM ('PLANNING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "platform_operation_runs" (
    "id"               UUID NOT NULL,
    "academy_id"       UUID NOT NULL,
    "operation"        "PlatformOperation" NOT NULL,
    "target_type"      TEXT NOT NULL,
    "target_id"        TEXT NOT NULL,
    "actor_user_id"    UUID NOT NULL,
    "request_id"       TEXT,
    "support_grant_id" UUID,
    "status"           "PlatformOperationStatus" NOT NULL DEFAULT 'PLANNING',
    "planned_count"    INTEGER NOT NULL DEFAULT 0,
    "student_count"    INTEGER NOT NULL DEFAULT 0,
    "dispatched_count" INTEGER NOT NULL DEFAULT 0,
    "completed_count"  INTEGER NOT NULL DEFAULT 0,
    "failed_count"     INTEGER NOT NULL DEFAULT 0,
    "failure_reason"   TEXT,
    "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at"       TIMESTAMPTZ(6),
    "finished_at"      TIMESTAMPTZ(6),

    CONSTRAINT "platform_operation_runs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "platform_operation_runs"
    ADD CONSTRAINT "platform_operation_runs_academy_id_fkey"
        FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Restrict, matching `platform_support_grants`: an operator's account must
    -- not be removable while these rows record what they did with it.
    ADD CONSTRAINT "platform_operation_runs_actor_user_id_fkey"
        FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The counters are advanced by a worker and must never be able to describe a
-- run that did more than it planned, or a negative amount of work.
ALTER TABLE "platform_operation_runs"
    ADD CONSTRAINT "platform_operation_runs_counts_non_negative_check"
        CHECK ("planned_count" >= 0 AND "student_count" >= 0 AND "dispatched_count" >= 0
               AND "completed_count" >= 0 AND "failed_count" >= 0),
    ADD CONSTRAINT "platform_operation_runs_dispatched_within_plan_check"
        CHECK ("dispatched_count" <= "planned_count"),
    ADD CONSTRAINT "platform_operation_runs_settled_within_dispatched_check"
        CHECK ("completed_count" + "failed_count" <= "dispatched_count");

-- One in-flight run per target. This is the whole answer to "what happens when
-- two operators press the same button at once": the second INSERT fails and the
-- console names the first operator, rather than two runs racing in the queue.
--
-- Filtered, so a target may be re-run any number of times once the previous run
-- has settled. Prisma cannot express a partial unique index, so it is written
-- here — the same shape as `academy_join_requests_one_pending_key` and
-- `academy_invitations_one_pending_email_key` in the auth foundation migration.
CREATE UNIQUE INDEX "platform_operation_runs_one_in_flight_key"
    ON "platform_operation_runs" ("operation", "target_id")
    WHERE "status" IN ('PLANNING', 'RUNNING');

CREATE INDEX "platform_operation_runs_academy_id_created_at_idx"
    ON "platform_operation_runs" ("academy_id", "created_at" DESC);
CREATE INDEX "platform_operation_runs_created_at_idx"
    ON "platform_operation_runs" ("created_at" DESC);

-- A submission the platform wrote to repair a record, rather than one a student
-- wrote by pressing submit. Null on every row that exists today, and on every
-- ordinary submission written from now on.
ALTER TABLE "submissions" ADD COLUMN "regrade_run_id" UUID;

ALTER TABLE "submissions"
    ADD CONSTRAINT "submissions_regrade_run_id_fkey"
        FOREIGN KEY ("regrade_run_id") REFERENCES "platform_operation_runs"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;

-- Serves a run counting its own progress. Partial: the column is null on nearly
-- every row in the table, and an index over those nulls would be most of the
-- table for a query that never asks about them.
CREATE INDEX "submissions_regrade_run_id_status_idx"
    ON "submissions" ("regrade_run_id", "status")
    WHERE "regrade_run_id" IS NOT NULL;
