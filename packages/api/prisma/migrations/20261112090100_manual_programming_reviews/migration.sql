ALTER TABLE programming_exercises
  ADD COLUMN manual_maximum_hundredths INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN manual_include_in_score BOOLEAN NOT NULL DEFAULT FALSE,
  ADD CONSTRAINT programming_manual_maximum CHECK (manual_maximum_hundredths BETWEEN 1 AND 1000000);
ALTER TABLE submissions
  ALTER COLUMN score DROP NOT NULL,
  ADD COLUMN request_id UUID,
  ADD COLUMN review_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN manual_assessment_snapshot JSONB,
  ADD COLUMN manual_review_result JSONB,
  ADD CONSTRAINT submissions_manual_shape CHECK (
    (submission_policy = 'MANUAL_REVIEW' AND status = 'RECORDED' AND score IS NULL
      AND total_count = 0 AND passed_count = 0 AND graded_at IS NULL
      AND execution_queue IS NULL AND execution_runtime_snapshot IS NULL
      AND manual_assessment_snapshot IS NOT NULL)
    OR (submission_policy <> 'MANUAL_REVIEW' AND status <> 'RECORDED' AND score IS NOT NULL)
  );
CREATE UNIQUE INDEX submissions_user_id_request_id_key ON submissions(user_id, request_id);
CREATE TABLE programming_submission_reviews (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE RESTRICT,
  reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewer_name TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  request_id UUID NOT NULL,
  score_hundredths INTEGER NOT NULL CHECK (score_hundredths BETWEEN 0 AND 1000000),
  completed BOOLEAN NOT NULL,
  feedback TEXT NOT NULL CHECK (length(feedback) <= 10000),
  reason TEXT NOT NULL CHECK (length(reason) <= 1000 AND (version = 1 OR length(trim(reason)) > 0)),
  previous_score_hundredths INTEGER,
  delta_hundredths INTEGER,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT programming_review_delta CHECK (
    (version = 1 AND previous_score_hundredths IS NULL AND delta_hundredths IS NULL)
    OR (version > 1 AND previous_score_hundredths IS NOT NULL
      AND delta_hundredths = score_hundredths - previous_score_hundredths)
  )
);
CREATE UNIQUE INDEX programming_submission_reviews_submission_id_version_key ON programming_submission_reviews(submission_id, version);
CREATE UNIQUE INDEX programming_submission_reviews_reviewer_id_request_id_key ON programming_submission_reviews(reviewer_id, request_id);

ALTER TABLE programming_submission_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON programming_submission_reviews FROM anon, authenticated;
