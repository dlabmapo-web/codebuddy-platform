-- Select the one curriculum tree that survives the versionless cutover.
-- A draft wins because it contains the Team Lead's newest work; courses whose
-- selected source is not published start hidden for review.
CREATE TEMP TABLE "_selected_course_versions" AS
SELECT DISTINCT ON ("course_id")
  "id" AS "version_id",
  "course_id",
  "status",
  "version_number"
FROM "course_versions"
ORDER BY
  "course_id",
  CASE "status"
    WHEN 'DRAFT' THEN 0
    WHEN 'PUBLISHED' THEN 1
    ELSE 2
  END,
  "version_number" DESC,
  "id" ASC;

-- Course availability replaces ACTIVE/ARCHIVED and version publication.
ALTER TABLE "courses" ADD COLUMN "is_visible" BOOLEAN NOT NULL DEFAULT false;
UPDATE "courses" AS "course"
SET "is_visible" = ("selected"."status" = 'PUBLISHED')
FROM "_selected_course_versions" AS "selected"
WHERE "selected"."course_id" = "course"."id";

-- Reparent only the selected tree directly to its course.
ALTER TABLE "course_modules" ADD COLUMN "course_id" UUID;
UPDATE "course_modules" AS "module"
SET "course_id" = "selected"."course_id"
FROM "_selected_course_versions" AS "selected"
WHERE "module"."course_version_id" = "selected"."version_id";

-- Rename curriculum visibility to match the product language. Existing flags
-- are preserved; defaults change so all newly authored content starts hidden.
ALTER TABLE "course_modules" RENAME COLUMN "is_published" TO "is_visible";
ALTER TABLE "lectures" RENAME COLUMN "is_published" TO "is_visible";
ALTER TABLE "materials" RENAME COLUMN "is_published" TO "is_visible";
ALTER TABLE "course_modules" ALTER COLUMN "is_visible" SET DEFAULT false;
ALTER TABLE "lectures" ALTER COLUMN "is_visible" SET DEFAULT false;
ALTER TABLE "materials" ALTER COLUMN "is_visible" SET DEFAULT false;

ALTER TABLE "programming_exercises"
ADD COLUMN "grading_revision" INTEGER NOT NULL DEFAULT 1;

-- Snapshot every submission's grading inputs before any historical version is
-- removed. Historical result pages then remain stable after live edits.
CREATE TABLE "submission_grading_cases" (
  "id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "input" TEXT NOT NULL,
  "expected_output" TEXT NOT NULL,
  "is_sample" BOOLEAN NOT NULL,
  CONSTRAINT "submission_grading_cases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "submission_grading_cases_submission_id_position_key"
ON "submission_grading_cases"("submission_id", "position");

ALTER TABLE "submission_grading_cases"
ADD CONSTRAINT "submission_grading_cases_submission_id_fkey"
FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "submission_grading_cases" (
  "id", "submission_id", "position", "input", "expected_output", "is_sample"
)
SELECT
  md5("submission"."id"::text || ':' || "test_case"."position"::text)::uuid,
  "submission"."id",
  "test_case"."position",
  "test_case"."input",
  "test_case"."expected_output",
  ("test_case"."visibility" = 'SAMPLE')
FROM "submissions" AS "submission"
JOIN "exercise_test_cases" AS "test_case"
  ON "test_case"."exercise_material_id" = "submission"."material_id";

ALTER TABLE "submissions"
  ADD COLUMN "source_material_id" UUID,
  ADD COLUMN "course_id" UUID,
  ADD COLUMN "grading_revision" INTEGER,
  ADD COLUMN "language" "ExerciseLanguage",
  ADD COLUMN "time_limit_ms" INTEGER,
  ADD COLUMN "memory_limit_mb" INTEGER;

UPDATE "submissions" AS "submission"
SET
  "source_material_id" = "submission"."material_id",
  "course_id" = "version"."course_id",
  "grading_revision" = 1,
  "language" = "exercise"."language",
  "time_limit_ms" = "exercise"."time_limit_ms",
  "memory_limit_mb" = "exercise"."memory_limit_mb"
FROM "programming_exercises" AS "exercise"
JOIN "course_versions" AS "version"
  ON "version"."id" = "exercise"."course_version_id"
WHERE "exercise"."material_id" = "submission"."material_id";

ALTER TABLE "submissions"
  ALTER COLUMN "source_material_id" SET NOT NULL,
  ALTER COLUMN "course_id" SET NOT NULL,
  ALTER COLUMN "grading_revision" SET NOT NULL,
  ALTER COLUMN "language" SET NOT NULL,
  ALTER COLUMN "time_limit_ms" SET NOT NULL,
  ALTER COLUMN "memory_limit_mb" SET NOT NULL,
  ALTER COLUMN "material_id" DROP NOT NULL;

ALTER TABLE "submissions"
ADD CONSTRAINT "submissions_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Student code keeps immutable source identity even when the old material no
-- longer belongs to the selected tree.
ALTER TABLE "exercise_drafts"
  ADD COLUMN "source_material_id" UUID,
  ADD COLUMN "course_id" UUID,
  ALTER COLUMN "material_id" DROP NOT NULL;

UPDATE "exercise_drafts" AS "draft"
SET
  "source_material_id" = "draft"."material_id",
  "course_id" = "version"."course_id"
FROM "programming_exercises" AS "exercise"
JOIN "course_versions" AS "version"
  ON "version"."id" = "exercise"."course_version_id"
WHERE "exercise"."material_id" = "draft"."material_id";

ALTER TABLE "exercise_drafts"
  ALTER COLUMN "source_material_id" SET NOT NULL,
  ALTER COLUMN "course_id" SET NOT NULL;

ALTER TABLE "exercise_drafts"
ADD CONSTRAINT "exercise_drafts_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_exercise_progress"
ADD COLUMN "grading_revision" INTEGER NOT NULL DEFAULT 1;

-- Logical exercise copies retain external_key. Use it to map submissions and
-- code from the former published tree to the selected live material.
CREATE TEMP TABLE "_live_exercises" AS
SELECT
  "selected"."course_id",
  "exercise"."external_key",
  "exercise"."material_id"
FROM "_selected_course_versions" AS "selected"
JOIN "programming_exercises" AS "exercise"
  ON "exercise"."course_version_id" = "selected"."version_id";

CREATE TEMP TABLE "_exercise_map" AS
SELECT
  "source"."material_id" AS "source_material_id",
  "version"."course_id",
  "live"."material_id" AS "live_material_id"
FROM "programming_exercises" AS "source"
JOIN "course_versions" AS "version"
  ON "version"."id" = "source"."course_version_id"
LEFT JOIN "_live_exercises" AS "live"
  ON "live"."course_id" = "version"."course_id"
 AND "live"."external_key" = "source"."external_key";

UPDATE "submissions" AS "submission"
SET "material_id" = "mapping"."live_material_id"
FROM "_exercise_map" AS "mapping"
WHERE "submission"."source_material_id" = "mapping"."source_material_id";

-- Several version copies can contain a draft for the same logical problem.
-- Map only the newest per-user draft to the live material and retain older
-- collisions as historical rows with a null active-material link.
CREATE TEMP TABLE "_ranked_draft_mappings" AS
SELECT
  "draft"."id" AS "draft_id",
  "mapping"."live_material_id",
  row_number() OVER (
    PARTITION BY "draft"."user_id", "mapping"."live_material_id"
    ORDER BY "draft"."updated_at" DESC, "draft"."id" DESC
  ) AS "mapping_rank"
FROM "exercise_drafts" AS "draft"
JOIN "_exercise_map" AS "mapping"
  ON "draft"."source_material_id" = "mapping"."source_material_id"
WHERE "mapping"."live_material_id" IS NOT NULL;

UPDATE "exercise_drafts" AS "draft"
SET "material_id" = NULL
FROM "_ranked_draft_mappings" AS "ranked"
WHERE "draft"."id" = "ranked"."draft_id";

UPDATE "exercise_drafts" AS "draft"
SET "material_id" = "ranked"."live_material_id"
FROM "_ranked_draft_mappings" AS "ranked"
WHERE "draft"."id" = "ranked"."draft_id"
  AND "ranked"."mapping_rank" = 1;

-- Presentation-only changes do not invalidate completion. Compare canonical
-- grading definitions and carry progress to a copied live problem only when
-- every grading field is unchanged.
CREATE TEMP TABLE "_grading_fingerprints" AS
SELECT
  "exercise"."material_id",
  md5(
    jsonb_build_object(
      'language', "exercise"."language"::text,
      'timeLimitMs', "exercise"."time_limit_ms",
      'memoryLimitMb', "exercise"."memory_limit_mb",
      'cases', COALESCE(
        jsonb_agg(
          jsonb_build_array(
            "test_case"."position",
            "test_case"."input",
            "test_case"."expected_output",
            "test_case"."visibility"::text
          ) ORDER BY "test_case"."position", "test_case"."id"
        ) FILTER (WHERE "test_case"."id" IS NOT NULL),
        '[]'::jsonb
      )
    )::text
  ) AS "fingerprint"
FROM "programming_exercises" AS "exercise"
LEFT JOIN "exercise_test_cases" AS "test_case"
  ON "test_case"."exercise_material_id" = "exercise"."material_id"
GROUP BY
  "exercise"."material_id",
  "exercise"."language",
  "exercise"."time_limit_ms",
  "exercise"."memory_limit_mb";

UPDATE "student_exercise_progress" AS "progress"
SET "material_id" = "mapping"."live_material_id"
FROM "_exercise_map" AS "mapping"
JOIN "_grading_fingerprints" AS "source_fingerprint"
  ON "source_fingerprint"."material_id" = "mapping"."source_material_id"
JOIN "_grading_fingerprints" AS "live_fingerprint"
  ON "live_fingerprint"."material_id" = "mapping"."live_material_id"
WHERE "progress"."material_id" = "mapping"."source_material_id"
  AND "mapping"."source_material_id" <> "mapping"."live_material_id"
  AND "source_fingerprint"."fingerprint" = "live_fingerprint"."fingerprint"
  AND NOT EXISTS (
    SELECT 1
    FROM "student_exercise_progress" AS "existing"
    WHERE "existing"."user_id" = "progress"."user_id"
      AND "existing"."material_id" = "mapping"."live_material_id"
  );

-- Any progress left on an unselected copy was either based on changed grading
-- data or lost a collision to an already-current row. Submission history and
-- code drafts remain intact.
DELETE FROM "student_exercise_progress" AS "progress"
USING "_exercise_map" AS "mapping"
WHERE "progress"."material_id" = "mapping"."source_material_id"
  AND (
    "mapping"."live_material_id" IS NULL
    OR "mapping"."source_material_id" <> "mapping"."live_material_id"
  );

-- Optional material links must survive deletion of historical content.
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_material_id_fkey";
ALTER TABLE "submissions"
ADD CONSTRAINT "submissions_material_id_fkey"
FOREIGN KEY ("material_id") REFERENCES "materials"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "exercise_drafts" DROP CONSTRAINT "exercise_drafts_material_id_fkey";
ALTER TABLE "exercise_drafts"
ADD CONSTRAINT "exercise_drafts_material_id_fkey"
FOREIGN KEY ("material_id") REFERENCES "materials"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Remove every unselected version tree now that history is self-contained.
DELETE FROM "course_modules" WHERE "course_id" IS NULL;

ALTER TABLE "course_modules"
  DROP CONSTRAINT "course_modules_course_version_id_fkey",
  ALTER COLUMN "course_id" SET NOT NULL,
  DROP COLUMN "course_version_id";

DROP INDEX IF EXISTS "course_modules_course_version_id_position_key";
DROP INDEX IF EXISTS "course_modules_course_version_id_idx";
CREATE UNIQUE INDEX "course_modules_course_id_position_key"
ON "course_modules"("course_id", "position");
CREATE INDEX "course_modules_course_id_idx" ON "course_modules"("course_id");
ALTER TABLE "course_modules"
ADD CONSTRAINT "course_modules_course_id_fkey"
FOREIGN KEY ("course_id") REFERENCES "courses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "programming_exercises"
  DROP CONSTRAINT "programming_exercises_course_version_id_fkey",
  DROP COLUMN "course_version_id";
DROP INDEX IF EXISTS "programming_exercises_course_version_id_external_key_key";
CREATE INDEX "programming_exercises_external_key_idx"
ON "programming_exercises"("external_key");

ALTER TABLE "submissions" DROP COLUMN "course_version_id";

DROP TABLE "course_versions";

DROP INDEX "courses_academy_id_status_updated_at_idx";
DROP INDEX "courses_one_active_title_per_academy_key";
ALTER TABLE "courses" DROP COLUMN "status";
CREATE INDEX "courses_academy_id_is_visible_updated_at_idx"
ON "courses"("academy_id", "is_visible", "updated_at");
CREATE UNIQUE INDEX "courses_one_visible_title_per_academy_key"
ON "courses"("academy_id", lower("title"))
WHERE "is_visible" = true;

DROP TABLE "_grading_fingerprints";
DROP TABLE "_ranked_draft_mappings";
DROP TABLE "_exercise_map";
DROP TABLE "_live_exercises";
DROP TABLE "_selected_course_versions";

DROP TYPE "CourseVersionStatus";
DROP TYPE "CourseStatus";
