-- Each course has one programming language, and every coding exercise in it
-- follows. Existing courses are Python.
ALTER TABLE courses
  ADD COLUMN language "ExerciseLanguage" NOT NULL DEFAULT 'PYTHON';

-- A course that already holds C or C++ coding exercises takes the compiled
-- language most of them use (C++ on a tie). Its exercises keep their own
-- stored language, which is what decides how each one runs.
UPDATE courses AS c
SET language = picked.language
FROM (
  SELECT DISTINCT ON (cm.course_id) cm.course_id, pe.language
  FROM programming_exercises pe
  JOIN materials m ON m.id = pe.material_id
  JOIN lectures l ON l.id = m.lecture_id
  JOIN course_modules cm ON cm.id = l.course_module_id
  WHERE pe.quiz IS NULL AND pe.language IN ('C', 'CPP')
  GROUP BY cm.course_id, pe.language
  ORDER BY cm.course_id, count(*) DESC, pe.language DESC
) AS picked
WHERE c.id = picked.course_id;
