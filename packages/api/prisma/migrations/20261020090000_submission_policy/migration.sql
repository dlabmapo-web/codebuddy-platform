CREATE TYPE "SubmissionPolicy" AS ENUM ('PRACTICE_ONLY', 'AUTOMATIC');
ALTER TABLE "programming_exercises" ADD COLUMN "submission_policy" "SubmissionPolicy" NOT NULL DEFAULT 'AUTOMATIC';
ALTER TABLE "submissions" ADD COLUMN "submission_policy" "SubmissionPolicy" NOT NULL DEFAULT 'AUTOMATIC';
UPDATE "programming_exercises" e SET "submission_policy" = 'PRACTICE_ONLY'
WHERE e."reference_pdf_material_id" IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM "exercise_test_cases" c WHERE c."exercise_material_id" = e."material_id");
