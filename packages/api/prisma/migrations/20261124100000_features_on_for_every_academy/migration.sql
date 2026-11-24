-- Tests (exams) and server-checked samples are on by default for every
-- academy, as the other features are. New academies get them on in code (no
-- feature is in rollout any more); this turns them on for every academy that
-- already exists. A manager or operator can still switch either off per
-- academy afterwards.
INSERT INTO "academy_feature_flags" ("academy_id", "feature", "is_enabled", "created_at", "updated_at")
SELECT a."id", f."feature"::"AcademyFeature", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "academies" a
CROSS JOIN (VALUES ('EXAMS'), ('SERVER_SAMPLE_CHECKS')) AS f("feature")
ON CONFLICT ("academy_id", "feature")
DO UPDATE SET "is_enabled" = true, "updated_at" = CURRENT_TIMESTAMP;
