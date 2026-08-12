-- Answer records: server-owned solve sessions and frozen record labels.
--
-- Additive. Every existing submission keeps its verdict, its cases, and its
-- place in the workspace; it gains the labels its history row prints and a
-- null solve time, because the interval this feature measures was never
-- recorded for it and judge latency is not a substitute.

-- One sitting with one problem. The workspace timer and the stored solve time
-- both read `started_at`, so they cannot disagree.
CREATE TABLE "exercise_solve_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exercise_solve_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exercise_solve_sessions_user_id_material_id_started_at_idx"
  ON "exercise_solve_sessions" ("user_id", "material_id", "started_at" DESC);

ALTER TABLE "exercise_solve_sessions"
  ADD CONSTRAINT "exercise_solve_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "exercise_solve_sessions"
  ADD CONSTRAINT "exercise_solve_sessions_material_id_fkey"
  FOREIGN KEY ("material_id") REFERENCES "materials"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Nullable first: the label columns are backfilled below before they are made
-- required, so the migration never has to invent a value inside a DEFAULT.
ALTER TABLE "submissions"
  ADD COLUMN "solve_session_id" UUID,
  ADD COLUMN "solve_elapsed_sec" INTEGER,
  ADD COLUMN "problem_title" TEXT,
  ADD COLUMN "course_title" TEXT,
  ADD COLUMN "module_title" TEXT,
  ADD COLUMN "lecture_title" TEXT,
  ADD COLUMN "module_position" INTEGER,
  ADD COLUMN "lecture_position" INTEGER,
  ADD COLUMN "problem_position" INTEGER;

ALTER TABLE "submissions"
  ADD CONSTRAINT "submissions_solve_session_id_fkey"
  FOREIGN KEY ("solve_session_id") REFERENCES "exercise_solve_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The labels an existing row would have printed, read from the graph it still
-- points at. `material_id` is SET NULL on content deletion, so a row whose
-- problem is already gone falls through to the neutral labels below.
UPDATE "submissions" AS s
SET
  "problem_title" = m."title",
  "course_title" = c."title",
  "module_title" = cm."title",
  "lecture_title" = l."title",
  "module_position" = cm."position",
  "lecture_position" = l."position",
  "problem_position" = m."position"
FROM "materials" AS m
  JOIN "lectures" AS l ON l."id" = m."lecture_id"
  JOIN "course_modules" AS cm ON cm."id" = l."course_module_id"
  JOIN "courses" AS c ON c."id" = cm."course_id"
WHERE m."id" = s."material_id";

-- An already-orphaned row keeps its verdict and reads as unavailable. Nothing
-- management-only is synthesized in its place.
UPDATE "submissions"
SET
  "problem_title" = COALESCE("problem_title", 'Unavailable problem'),
  "course_title" = COALESCE("course_title", 'Unavailable problem'),
  "module_title" = COALESCE("module_title", 'Unavailable problem'),
  "lecture_title" = COALESCE("lecture_title", 'Unavailable problem'),
  "module_position" = COALESCE("module_position", 0),
  "lecture_position" = COALESCE("lecture_position", 0),
  "problem_position" = COALESCE("problem_position", 0)
WHERE "problem_title" IS NULL
   OR "course_title" IS NULL
   OR "module_title" IS NULL
   OR "lecture_title" IS NULL
   OR "module_position" IS NULL
   OR "lecture_position" IS NULL
   OR "problem_position" IS NULL;

ALTER TABLE "submissions"
  ALTER COLUMN "problem_title" SET NOT NULL,
  ALTER COLUMN "course_title" SET NOT NULL,
  ALTER COLUMN "module_title" SET NOT NULL,
  ALTER COLUMN "lecture_title" SET NOT NULL,
  ALTER COLUMN "module_position" SET NOT NULL,
  ALTER COLUMN "lecture_position" SET NOT NULL,
  ALTER COLUMN "problem_position" SET NOT NULL;

-- Serves the academy-wide records page: one student's history, newest first,
-- with the id tiebreak the default ordering pages on.
CREATE INDEX "submissions_user_id_created_at_id_idx"
  ON "submissions" ("user_id", "created_at" DESC, "id" DESC);
