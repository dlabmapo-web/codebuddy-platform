-- A correction note is optional; keep the existing length limit and history.
ALTER TABLE programming_submission_reviews
  DROP CONSTRAINT programming_submission_reviews_check;

ALTER TABLE programming_submission_reviews
  ADD CONSTRAINT programming_submission_reviews_reason_length_check
  CHECK (length(reason) <= 1000);
