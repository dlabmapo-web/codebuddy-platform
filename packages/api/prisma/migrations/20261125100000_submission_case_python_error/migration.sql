-- The Python exception that ended a case: in full for a public case, for the
-- error coach after Submit; only a built-in type and line for a hidden one.
-- And how a wrong output differs, as one word, for every case. A hidden case
-- never stores its output. Null on every existing row.
ALTER TABLE "submission_cases"
  ADD COLUMN "python_error_type" VARCHAR(100),
  ADD COLUMN "python_error_message" VARCHAR(500),
  ADD COLUMN "python_error_line" INTEGER,
  ADD COLUMN "output_difference" VARCHAR(20);
