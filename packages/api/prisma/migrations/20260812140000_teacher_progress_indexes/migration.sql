-- Solution status reads the same two tables from the problem's side rather
-- than the student's, which the existing user-first indexes cannot serve.
--
-- Neither is redundant with what is already there: `submissions` has
-- (user_id, material_id, created_at DESC) and (user_id, created_at DESC, id
-- DESC), both of which need a user to start from, while the By-problem views
-- and the class-wide attention window start from a set of materials.
CREATE INDEX IF NOT EXISTS "submissions_material_id_user_id_created_at_idx"
  ON "submissions" ("material_id", "user_id", "created_at" DESC);

-- Answers "who in this class has solved this exercise" without walking every
-- row of a student's progress.
CREATE INDEX IF NOT EXISTS "student_exercise_progress_material_id_status_user_id_idx"
  ON "student_exercise_progress" ("material_id", "status", "user_id");
