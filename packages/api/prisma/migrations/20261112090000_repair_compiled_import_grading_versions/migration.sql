-- Compiled workbook imports selected weighted grading but omitted its semantic
-- version, inheriting the legacy-v1 database default. Admission correctly rejects
-- that inconsistent pair. Repair only that known C/C++ import defect, including
-- library templates and their existing copies. Python and unknown versions stay
-- untouched; submission snapshots, cases, points, policy and limits are preserved.
UPDATE programming_exercises
SET grading_semantic_version = 'elice-v1',
    updated_at = CURRENT_TIMESTAMP
WHERE language IN ('C', 'CPP')
  AND grading_mode = 'ELICE_STDIO'
  AND input_prompt_policy = 'INCLUDE'
  AND grading_semantic_version = 'legacy-v1';
