-- Human reviews update only the current projection; the submitted program and
-- assessment definition stay immutable. Live foreign keys may be nulled by
-- existing retention/deletion actions without losing the frozen source ids.
CREATE FUNCTION protect_programming_manual_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.submission_policy = 'MANUAL_REVIEW' AND
    (to_jsonb(NEW) - ARRAY['review_version','manual_review_result','material_id','class_id','solve_session_id','regrade_run_id'])
      IS DISTINCT FROM
    (to_jsonb(OLD) - ARRAY['review_version','manual_review_result','material_id','class_id','solve_session_id','regrade_run_id'])
  THEN RAISE EXCEPTION 'Manual programming submission snapshots are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER programming_manual_submission_snapshot BEFORE UPDATE ON submissions
  FOR EACH ROW EXECUTE FUNCTION protect_programming_manual_submission();
CREATE FUNCTION protect_programming_manual_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Programming reviews are append-only'; END $$;
CREATE TRIGGER programming_manual_review_history BEFORE UPDATE ON programming_submission_reviews
  FOR EACH ROW EXECUTE FUNCTION protect_programming_manual_review();
CREATE INDEX submissions_manual_assessment_history_idx ON submissions
  (class_id, material_id, user_id, grading_revision, created_at DESC, id DESC)
  WHERE submission_policy = 'MANUAL_REVIEW' AND regrade_run_id IS NULL;
