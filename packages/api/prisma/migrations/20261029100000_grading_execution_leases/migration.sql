ALTER TABLE grading_case_checkpoints ADD COLUMN measured_runtime_ms DOUBLE PRECISION CHECK (measured_runtime_ms >= 0 AND measured_runtime_ms <= 86400000);
ALTER TABLE submissions ADD COLUMN regrade_counted_at TIMESTAMPTZ(6);
-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "admission_request_id" UUID;

-- CreateTable
CREATE TABLE "grading_execution_leases" (
    "id" UUID NOT NULL,
    "submission_id" UUID,
    "staff_practice_attempt_id" UUID,
    "generation" INTEGER NOT NULL,
    "lease_token" UUID NOT NULL,
    "worker_generation" UUID NOT NULL,
    "broker_generation" UUID NOT NULL,
    "reservation_id" UUID,
    "admission_epoch" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "runtime" JSONB NOT NULL,
    "memory_limit_mb" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminal_commit_id" UUID,
    "retired_at" TIMESTAMPTZ(6),

    CONSTRAINT "grading_execution_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_execution_cases" (
    "id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "checkpoint_id" UUID,
    "receipt_id" UUID,
    "acknowledged_at" TIMESTAMPTZ(6),

    CONSTRAINT "grading_execution_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_admission_epochs" (
    "epoch" BIGINT NOT NULL,
    "worker_generation" UUID NOT NULL,
    "reconciliation_id" UUID,
    "sealed_at" TIMESTAMPTZ(6),

    CONSTRAINT "grading_admission_epochs_pkey" PRIMARY KEY ("epoch")
);

-- CreateIndex
CREATE UNIQUE INDEX "grading_execution_leases_lease_token_key" ON "grading_execution_leases"("lease_token");

-- CreateIndex
CREATE INDEX "grading_execution_leases_admission_epoch_retired_at_idx" ON "grading_execution_leases"("admission_epoch", "retired_at");

-- CreateIndex
CREATE UNIQUE INDEX "grading_execution_leases_submission_id_generation_key" ON "grading_execution_leases"("submission_id", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "grading_execution_leases_staff_practice_attempt_id_generati_key" ON "grading_execution_leases"("staff_practice_attempt_id", "generation");

-- CreateIndex
CREATE UNIQUE INDEX "grading_execution_cases_lease_id_position_key" ON "grading_execution_cases"("lease_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "grading_admission_epochs_reconciliation_id_key" ON "grading_admission_epochs"("reconciliation_id");

-- CreateIndex
CREATE UNIQUE INDEX "submission_admission_request_key" ON "submissions"("user_id", "admission_request_id");

-- AddForeignKey
ALTER TABLE "grading_execution_leases" ADD CONSTRAINT "grading_execution_leases_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_execution_leases" ADD CONSTRAINT "grading_execution_leases_staff_practice_attempt_id_fkey" FOREIGN KEY ("staff_practice_attempt_id") REFERENCES "staff_practice_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_execution_cases" ADD CONSTRAINT "grading_execution_cases_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "grading_execution_leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE grading_execution_leases ADD CONSTRAINT grading_lease_owner CHECK (num_nonnulls(submission_id, staff_practice_attempt_id)=1);
ALTER TABLE grading_execution_leases ADD CONSTRAINT grading_lease_bounds CHECK (generation>0 AND admission_epoch>0 AND memory_limit_mb BETWEEN 16 AND 4096 AND kind IN ('submission','practice','maintenance'));
ALTER TABLE grading_execution_cases ADD CONSTRAINT grading_case_position CHECK (position>0);
ALTER TABLE grading_execution_cases ADD CONSTRAINT grading_case_checkpoint_pair CHECK ((receipt_id IS NULL)=(checkpoint_id IS NULL));
ALTER TABLE grading_admission_epochs ADD CONSTRAINT grading_epoch_positive CHECK (epoch>0 AND (sealed_at IS NULL OR reconciliation_id IS NOT NULL));

CREATE FUNCTION grading_lease_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.submission_id, OLD.staff_practice_attempt_id, OLD.generation, OLD.lease_token,
      OLD.worker_generation, OLD.broker_generation, OLD.admission_epoch, OLD.kind, OLD.runtime, OLD.memory_limit_mb, OLD.created_at)
    IS DISTINCT FROM
     (NEW.submission_id, NEW.staff_practice_attempt_id, NEW.generation, NEW.lease_token,
      NEW.worker_generation, NEW.broker_generation, NEW.admission_epoch, NEW.kind, NEW.runtime, NEW.memory_limit_mb, NEW.created_at)
    OR (OLD.reservation_id IS NOT NULL AND OLD.reservation_id IS DISTINCT FROM NEW.reservation_id)
    OR (OLD.terminal_commit_id IS NOT NULL AND OLD.terminal_commit_id IS DISTINCT FROM NEW.terminal_commit_id)
  THEN RAISE EXCEPTION 'execution lease identity is immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER grading_lease_identity_immutable BEFORE UPDATE ON grading_execution_leases
FOR EACH ROW EXECUTE FUNCTION grading_lease_identity_immutable();
ALTER TABLE grading_execution_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_execution_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_admission_epochs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON grading_execution_leases, grading_execution_cases, grading_admission_epochs FROM PUBLIC, anon, authenticated;
