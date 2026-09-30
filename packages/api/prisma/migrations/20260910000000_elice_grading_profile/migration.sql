-- Milestone 1 of the Elice grading compatibility work.
--
-- Every column is additive and defaulted, so existing exercises stay on
-- LEGACY_STDIO with equal case weights and their stored scores keep the exact
-- meaning they have today. The backfill at the end is the one exception: it
-- corrects rows that the new `execution_state` default would otherwise
-- misdescribe.

-- CreateEnum
CREATE TYPE "CaseComparator" AS ENUM ('STDOUT', 'STDOUT_MATCH', 'STDOUT_NOMATCH', 'STDOUT_REGEX', 'STDOUT_REGEX_NOMATCH');

-- CreateEnum
CREATE TYPE "GradingProfileMode" AS ENUM ('LEGACY_STDIO', 'ELICE_STDIO');

-- CreateEnum
CREATE TYPE "ContinuationPolicy" AS ENUM ('LEGACY_STOP_ON_RESOURCE', 'CONTINUE_WITHIN_BUDGET');

-- CreateEnum
CREATE TYPE "ExitStatusPolicy" AS ENUM ('FAIL_ON_RUNTIME_ERROR');

-- CreateEnum
CREATE TYPE "MaterialScorePolicy" AS ENUM ('PROPORTIONAL', 'ABSOLUTE_CAP');

-- CreateEnum
CREATE TYPE "CaseExecutionState" AS ENUM ('EXECUTED', 'NOT_RUN');

-- CreateEnum
CREATE TYPE "GradingAbortReason" AS ENUM ('TOTAL_DEADLINE', 'INFRASTRUCTURE_FAILURE', 'POLICY_REVOKED');

-- AlterEnum
ALTER TYPE "CaseOutcome" ADD VALUE 'PASSED_WITH_WARNING';

-- AlterTable
ALTER TABLE "exercise_test_cases" ADD COLUMN     "comparator" "CaseComparator" NOT NULL DEFAULT 'STDOUT',
ADD COLUMN     "label" TEXT,
ADD COLUMN     "soft_penalty" INTEGER,
ADD COLUMN     "soft_time_limit_ms" INTEGER,
ADD COLUMN     "time_limit_ms_override" INTEGER,
ADD COLUMN     "weight" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "programming_exercises" ADD COLUMN     "comparator_time_limit_ms" INTEGER,
ADD COLUMN     "continuation_policy" "ContinuationPolicy" NOT NULL DEFAULT 'LEGACY_STOP_ON_RESOURCE',
ADD COLUMN     "exit_status_policy" "ExitStatusPolicy" NOT NULL DEFAULT 'FAIL_ON_RUNTIME_ERROR',
ADD COLUMN     "feedback_policy" JSONB,
ADD COLUMN     "grading_mode" "GradingProfileMode" NOT NULL DEFAULT 'LEGACY_STDIO',
ADD COLUMN     "grading_semantic_version" TEXT NOT NULL DEFAULT 'legacy-v1',
ADD COLUMN     "material_maximum_hundredths" INTEGER,
ADD COLUMN     "material_score_policy" "MaterialScorePolicy",
ADD COLUMN     "total_time_limit_ms" INTEGER;

-- AlterTable
ALTER TABLE "submission_cases" ADD COLUMN     "awarded_weight" INTEGER,
ADD COLUMN     "execution_state" "CaseExecutionState" NOT NULL DEFAULT 'EXECUTED';

-- AlterTable
ALTER TABLE "submission_grading_cases" ADD COLUMN     "comparator" "CaseComparator" NOT NULL DEFAULT 'STDOUT',
ADD COLUMN     "effective_time_limit_ms" INTEGER,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "soft_penalty" INTEGER,
ADD COLUMN     "soft_time_limit_ms" INTEGER,
ADD COLUMN     "time_limit_ms_override" INTEGER,
ADD COLUMN     "weight" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "applied_score_hundredths" INTEGER,
ADD COLUMN     "comparator_time_limit_ms" INTEGER,
ADD COLUMN     "continuation_policy" "ContinuationPolicy" NOT NULL DEFAULT 'LEGACY_STOP_ON_RESOURCE',
ADD COLUMN     "earned_weight" INTEGER,
ADD COLUMN     "exit_status_policy" "ExitStatusPolicy" NOT NULL DEFAULT 'FAIL_ON_RUNTIME_ERROR',
ADD COLUMN     "feedback_policy" JSONB,
ADD COLUMN     "grading_abort_reason" "GradingAbortReason",
ADD COLUMN     "grading_aborted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grading_mode" "GradingProfileMode" NOT NULL DEFAULT 'LEGACY_STDIO',
ADD COLUMN     "grading_policy_snapshot" JSONB,
ADD COLUMN     "grading_semantic_version" TEXT NOT NULL DEFAULT 'legacy-v1',
ADD COLUMN     "material_maximum_hundredths" INTEGER,
ADD COLUMN     "material_score_policy" "MaterialScorePolicy",
ADD COLUMN     "possible_weight" INTEGER,
ADD COLUMN     "total_time_limit_ms" INTEGER;

-- A case that was skipped after an early exit never ran, and the EXECUTED
-- default would make historical skips read as executed wrong answers to
-- anything that trusts this column. Only SKIPPED rows are touched.
UPDATE "submission_cases"
SET "execution_state" = 'NOT_RUN'
WHERE "outcome" = 'SKIPPED';
