-- Multi-file C/C++ exercises (docs/superpowers/specs/2026-11-19-c-cpp-multi-file-design.md).
-- Additive and nullable: a single-file exercise keeps NULL and behaves as before.
ALTER TABLE programming_exercises ADD COLUMN source_project JSONB;

-- Only compiled languages have projects.
ALTER TABLE programming_exercises ADD CONSTRAINT programming_exercises_source_project_language
  CHECK (source_project IS NULL OR language IN ('C', 'CPP'));
