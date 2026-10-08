CREATE FUNCTION protect_short_answer_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.submission_id,NEW.definition,NEW.evaluator_version)
 IS DISTINCT FROM ROW(OLD.submission_id,OLD.definition,OLD.evaluator_version)
 THEN RAISE EXCEPTION 'Short-answer assessment snapshots are immutable'; END IF;
 IF OLD.status = 'GRADED' AND ROW(NEW.status,NEW.verdict,NEW.score_hundredths,NEW.completed,NEW.evaluated_at)
 IS DISTINCT FROM ROW(OLD.status,OLD.verdict,OLD.score_hundredths,OLD.completed,OLD.evaluated_at)
 THEN RAISE EXCEPTION 'Short-answer automatic results are terminal; publish a teacher review'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER short_answer_snapshot BEFORE UPDATE ON "short_answer_assessments" FOR EACH ROW EXECUTE FUNCTION protect_short_answer_snapshot();
ALTER TABLE "short_answer_assessments" ADD CONSTRAINT "short_answer_grade_bounds" CHECK (
 score_hundredths IS NULL OR score_hundredths BETWEEN 0 AND 1000000
);
ALTER TABLE "short_answer_assessments" ADD CONSTRAINT "short_answer_terminal_result" CHECK (
 status <> 'GRADED' OR (verdict IS NOT NULL AND score_hundredths IS NOT NULL AND completed IS NOT NULL AND evaluated_at IS NOT NULL)
);
