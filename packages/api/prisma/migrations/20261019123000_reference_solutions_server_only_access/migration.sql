-- Private teaching answers are served only by authorized application endpoints.
ALTER TABLE "programming_exercise_solutions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "programming_exercise_solutions" FROM PUBLIC, anon, authenticated;
