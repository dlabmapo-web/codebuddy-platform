-- Additive: one advisory row per programming exercise; nothing grades from it.
CREATE TYPE "SolutionCheckStatus" AS ENUM ('QUEUED', 'RUNNING', 'PASSED', 'FAILED', 'NO_SOLUTION', 'NOT_CHECKABLE', 'ERRORED');

CREATE TABLE exercise_solution_checks (
  material_id UUID NOT NULL,
  check_id UUID NOT NULL,
  grading_revision INTEGER NOT NULL,
  solutions_digest TEXT NOT NULL,
  status "SolutionCheckStatus" NOT NULL,
  engine_version TEXT NOT NULL,
  execution_queue TEXT,
  execution_runtime_snapshot JSONB,
  result JSONB,
  queued_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ(6),
  finished_at TIMESTAMPTZ(6),
  CONSTRAINT exercise_solution_checks_pkey PRIMARY KEY (material_id),
  CONSTRAINT exercise_solution_checks_material_id_fkey FOREIGN KEY (material_id)
    REFERENCES programming_exercises (material_id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX exercise_solution_checks_execution_queue_status_queued_at_idx
  ON exercise_solution_checks (execution_queue, status, queued_at);
