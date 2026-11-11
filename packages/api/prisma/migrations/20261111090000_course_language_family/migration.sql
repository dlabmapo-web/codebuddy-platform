-- A course is Python or C/C++. A C/C++ course mixes the two: each coding
-- problem keeps C or C++ in programming_exercises.language.
CREATE TYPE "CourseLanguage" AS ENUM ('PYTHON', 'C_CPP');

ALTER TABLE courses ALTER COLUMN language DROP DEFAULT;
ALTER TABLE courses ALTER COLUMN language TYPE "CourseLanguage"
  USING (CASE WHEN language::text IN ('C', 'CPP') THEN 'C_CPP' ELSE 'PYTHON' END)::"CourseLanguage";
ALTER TABLE courses ALTER COLUMN language SET DEFAULT 'PYTHON';
