-- Every problem is scored out of 100 regardless of case count, so no per-case
-- points column exists and no per-submission maximum needs snapshotting.

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "student_exercise_progress" ADD COLUMN "best_score" INTEGER NOT NULL DEFAULT 0;

-- Backfill from what already exists, so historical submissions read correctly
-- rather than showing zero beside a passing verdict.
UPDATE "submissions"
   SET "score" = ROUND(("passed_count"::numeric / NULLIF("total_count", 0)) * 100)
 WHERE "total_count" > 0;

UPDATE "student_exercise_progress" p
   SET "best_score" = COALESCE((
         SELECT MAX(s."score") FROM "submissions" s
          WHERE s."user_id" = p."user_id" AND s."material_id" = p."material_id"
       ), 0);
