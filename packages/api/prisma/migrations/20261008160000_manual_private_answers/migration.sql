ALTER TABLE "manual_materials" ADD COLUMN "model_answer" TEXT NOT NULL DEFAULT '';
ALTER TABLE "manual_materials" ADD COLUMN "solution_assets" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "manual_materials" ADD CONSTRAINT "manual_profile_bounds" CHECK (
 width BETWEEN 320 AND 2048 AND height BETWEEN 320 AND 2048 AND time_limit_seconds BETWEEN 1 AND 1800
 AND memory_limit_mb BETWEEN 128 AND 512 AND maximum_hundredths BETWEEN 1 AND 1000000
 AND revision > 0 AND (NOT include_in_score OR submit_enabled));
ALTER TABLE "manual_reviews" ADD CONSTRAINT "manual_review_bounds" CHECK (score_hundredths BETWEEN 0 AND 1000000 AND version > 0);
CREATE FUNCTION protect_manual_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.material_id,NEW.user_id,NEW.class_id,NEW.files,NEW.answer,NEW.profile,NEW.revision,NEW.maximum_hundredths,NEW.include_in_score,NEW.request_key,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.material_id,OLD.user_id,OLD.class_id,OLD.files,OLD.answer,OLD.profile,OLD.revision,OLD.maximum_hundredths,OLD.include_in_score,OLD.request_key,OLD.created_at)
 THEN RAISE EXCEPTION 'Manual submission snapshots are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER manual_submission_snapshot BEFORE UPDATE ON "manual_submissions" FOR EACH ROW EXECUTE FUNCTION protect_manual_submission();
CREATE FUNCTION protect_manual_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Manual reviews are append-only'; END $$;
CREATE TRIGGER manual_review_history BEFORE UPDATE ON "manual_reviews" FOR EACH ROW EXECUTE FUNCTION protect_manual_review();
