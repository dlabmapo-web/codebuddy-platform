-- C and C++ exercises on the native GCC runtime. Additive only: every
-- existing row keeps its meaning (Python, compiled, no exit details).
ALTER TYPE "ExerciseLanguage" ADD VALUE 'C';
ALTER TYPE "ExerciseLanguage" ADD VALUE 'CPP';
ALTER TYPE "AcademyFeature" ADD VALUE 'C_CPP_EXERCISES';

ALTER TABLE submissions
  ADD COLUMN compile_failed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN compile_diagnostics TEXT,
  ADD CONSTRAINT submissions_compile_diagnostics_check
    CHECK (compile_failed = (compile_diagnostics IS NOT NULL));

ALTER TABLE submission_cases
  ADD COLUMN exit_code INTEGER,
  ADD COLUMN exit_signal TEXT,
  ADD CONSTRAINT submission_cases_exit_check
    CHECK (
      (exit_code IS NULL OR exit_signal IS NULL)
      AND ((exit_code IS NULL AND exit_signal IS NULL) OR outcome = 'RUNTIME_ERROR')
      AND (exit_code IS NULL OR exit_code BETWEEN 1 AND 255)
    );
