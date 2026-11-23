-- Exams: a test may show each student's score as soon as their attempt ends,
-- instead of waiting for staff to release results for the class. Additive;
-- every existing test keeps waiting for a release.
ALTER TABLE lecture_tests ADD COLUMN show_score_on_finish BOOLEAN NOT NULL DEFAULT FALSE;
