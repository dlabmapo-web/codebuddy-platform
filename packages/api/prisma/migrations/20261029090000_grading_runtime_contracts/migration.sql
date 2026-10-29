-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "execution_generation" INTEGER,
ADD COLUMN     "execution_lease_token" UUID,
ADD COLUMN     "execution_runtime_snapshot" JSONB;

-- AlterTable
ALTER TABLE "staff_practice_attempts" ADD COLUMN     "execution_generation" INTEGER,
ADD COLUMN     "execution_lease_token" UUID;

-- CreateTable
CREATE TABLE "grading_dispatch_intents" (
    "id" UUID NOT NULL,
    "submission_id" UUID,
    "staff_practice_attempt_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatched_at" TIMESTAMPTZ(6),
    "dispatch_attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_token" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "grading_dispatch_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_case_checkpoints" (
    "id" UUID NOT NULL,
    "submission_id" UUID,
    "staff_practice_attempt_id" UUID,
    "generation" INTEGER NOT NULL,
    "lease_token" UUID NOT NULL,
    "case_position" INTEGER NOT NULL,
    "receipt_id" UUID,
    "execution_runtime_snapshot" JSONB NOT NULL,
    "comparator" "CaseComparator" NOT NULL,
    "outcome" "CaseOutcome" NOT NULL,
    "output_matched" BOOLEAN,
    "soft_limit_exceeded" BOOLEAN NOT NULL DEFAULT false,
    "runtime_ms" INTEGER,
    "weight" INTEGER NOT NULL,
    "soft_penalty" INTEGER,
    "awarded_weight" INTEGER,
    "execution_state" "CaseExecutionState" NOT NULL,
    "is_sample" BOOLEAN NOT NULL,
    "actual_output" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grading_case_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grading_dispatch_intents_submission_id_key" ON "grading_dispatch_intents"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "grading_dispatch_intents_staff_practice_attempt_id_key" ON "grading_dispatch_intents"("staff_practice_attempt_id");

-- CreateIndex
CREATE INDEX "grading_dispatch_pending_idx" ON "grading_dispatch_intents"("next_attempt_at", "id") WHERE "dispatched_at" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "grading_case_checkpoints_receipt_id_key" ON "grading_case_checkpoints"("receipt_id");

-- CreateIndex
CREATE INDEX "grading_checkpoint_reconciliation_idx" ON "grading_case_checkpoints"("created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "grading_checkpoint_submission_case_key" ON "grading_case_checkpoints"("submission_id", "generation", "case_position");

-- CreateIndex
CREATE UNIQUE INDEX "grading_checkpoint_practice_case_key" ON "grading_case_checkpoints"("staff_practice_attempt_id", "generation", "case_position");

-- AddForeignKey
ALTER TABLE "grading_dispatch_intents" ADD CONSTRAINT "grading_dispatch_intents_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_dispatch_intents" ADD CONSTRAINT "grading_dispatch_intents_staff_practice_attempt_id_fkey" FOREIGN KEY ("staff_practice_attempt_id") REFERENCES "staff_practice_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_case_checkpoints" ADD CONSTRAINT "grading_case_checkpoints_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_case_checkpoints" ADD CONSTRAINT "grading_case_checkpoints_staff_practice_attempt_id_fkey" FOREIGN KEY ("staff_practice_attempt_id") REFERENCES "staff_practice_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ownership and recovery keys are private infrastructure state.
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_execution_generation_check"
  CHECK ("execution_generation" IS NULL OR "execution_generation" > 0);
ALTER TABLE "staff_practice_attempts" ADD CONSTRAINT "practice_execution_generation_check"
  CHECK ("execution_generation" IS NULL OR "execution_generation" > 0);
ALTER TABLE "grading_dispatch_intents" ADD CONSTRAINT "grading_dispatch_one_owner_check"
  CHECK (num_nonnulls("submission_id", "staff_practice_attempt_id") = 1),
  ADD CONSTRAINT "grading_dispatch_attempts_check" CHECK ("dispatch_attempts" >= 0),
  ADD CONSTRAINT "grading_dispatch_lease_check" CHECK (("lease_token" IS NULL) = ("lease_expires_at" IS NULL));
ALTER TABLE "grading_case_checkpoints" ADD CONSTRAINT "grading_checkpoint_one_owner_check"
  CHECK (num_nonnulls("submission_id", "staff_practice_attempt_id") = 1),
  ADD CONSTRAINT "grading_checkpoint_generation_case_check" CHECK ("generation" > 0 AND "case_position" > 0),
  ADD CONSTRAINT "grading_checkpoint_scoring_check" CHECK (
    "weight" >= 0 AND ("soft_penalty" IS NULL OR "soft_penalty" BETWEEN 0 AND "weight")
    AND ("awarded_weight" IS NULL OR "awarded_weight" BETWEEN 0 AND "weight")
    AND ("runtime_ms" IS NULL OR "runtime_ms" >= 0)),
  ADD CONSTRAINT "grading_checkpoint_receipt_check" CHECK (
    ("execution_state" = 'EXECUTED' AND "receipt_id" IS NOT NULL)
    OR ("execution_state" = 'NOT_RUN' AND "receipt_id" IS NULL)),
  ADD CONSTRAINT "grading_checkpoint_output_check" CHECK (
    "actual_output" IS NULL OR ("is_sample" AND char_length("actual_output") <= 10000)),
  ADD CONSTRAINT "grading_checkpoint_runtime_size_check" CHECK (octet_length("execution_runtime_snapshot"::text) <= 4096);
ALTER TABLE "grading_dispatch_intents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grading_case_checkpoints" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "grading_dispatch_intents", "grading_case_checkpoints" FROM PUBLIC, anon, authenticated;
