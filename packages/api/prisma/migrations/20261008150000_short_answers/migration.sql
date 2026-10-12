ALTER TABLE "manual_materials" ADD COLUMN "short_answer" JSONB;
CREATE TABLE "short_answer_assessments" (
  "submission_id" UUID PRIMARY KEY REFERENCES "manual_submissions"("id") ON DELETE CASCADE,
  "definition" JSONB NOT NULL,
  "evaluator_version" TEXT NOT NULL DEFAULT 'short-answer-js-v1',
  "status" TEXT NOT NULL CHECK ("status" IN ('MANUAL','PENDING','EVALUATING','ERROR','GRADED')),
  "verdict" TEXT CHECK ("verdict" IN ('CORRECT','INCORRECT')),
  "score_hundredths" INTEGER,
  "completed" BOOLEAN,
  "lease_until" TIMESTAMPTZ,
  "evaluated_at" TIMESTAMPTZ
);
CREATE INDEX "short_answer_assessments_status_lease_until_idx" ON "short_answer_assessments"("status", "lease_until");
ALTER TABLE "short_answer_assessments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "short_answer_assessments" FROM anon, authenticated;
