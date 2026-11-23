-- Elice parity for tests: language reference link, explanations in review,
-- per-class entry deadline and exit time, and run counts per attempt.
ALTER TABLE lecture_tests
  ADD COLUMN language_reference BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN show_explanations BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE class_lecture_tests
  ADD COLUMN entry_closes_at TIMESTAMPTZ(6),
  ADD COLUMN exit_opens_at TIMESTAMPTZ(6);

ALTER TABLE test_attempts
  ADD COLUMN run_counts JSONB NOT NULL DEFAULT '{}'::jsonb;
