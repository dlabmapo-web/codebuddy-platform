ALTER TYPE "MaterialType" ADD VALUE 'MULTIPLE_CHOICE';
ALTER TABLE manual_materials ADD COLUMN multiple_choice JSONB;
ALTER TABLE manual_materials ADD CONSTRAINT choice_definition_exclusive CHECK (multiple_choice IS NULL OR short_answer IS NULL);
CREATE TABLE multiple_choice_assessments (
 submission_id UUID PRIMARY KEY REFERENCES manual_submissions(id) ON DELETE CASCADE,
 definition JSONB NOT NULL,
 selected_option_ids JSONB NOT NULL,
 display_order JSONB NOT NULL,
 evaluator_version TEXT NOT NULL DEFAULT 'multiple-choice-set-v1',
 status TEXT NOT NULL DEFAULT 'GRADED' CHECK (status = 'GRADED'),
 verdict TEXT NOT NULL CHECK (verdict IN ('CORRECT','INCORRECT')),
 score_hundredths INTEGER NOT NULL CHECK (score_hundredths BETWEEN 0 AND 1000000),
 completed BOOLEAN NOT NULL,
 evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK ((verdict = 'CORRECT') = completed),
 CHECK (completed OR score_hundredths = 0)
);
ALTER TABLE multiple_choice_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON multiple_choice_assessments FROM anon, authenticated;
CREATE FUNCTION protect_choice_assessment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Multiple-choice snapshots and results are immutable; publish a teacher review';
END $$;
CREATE TRIGGER choice_snapshot BEFORE UPDATE ON multiple_choice_assessments FOR EACH ROW EXECUTE FUNCTION protect_choice_assessment();
CREATE FUNCTION exclusive_assessment_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Serialize admissions to either assessment table for this submission.
 PERFORM id FROM manual_submissions WHERE id = NEW.submission_id FOR UPDATE;
 IF TG_TABLE_NAME = 'multiple_choice_assessments' THEN
  IF EXISTS(SELECT 1 FROM short_answer_assessments WHERE submission_id = NEW.submission_id) THEN
   RAISE EXCEPTION 'Assessment kinds are mutually exclusive';
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM multiple_choice_assessments WHERE submission_id = NEW.submission_id) THEN
   RAISE EXCEPTION 'Assessment kinds are mutually exclusive';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER choice_kind BEFORE INSERT ON multiple_choice_assessments FOR EACH ROW EXECUTE FUNCTION exclusive_assessment_kind();
CREATE TRIGGER short_answer_kind BEFORE INSERT ON short_answer_assessments FOR EACH ROW EXECUTE FUNCTION exclusive_assessment_kind();
