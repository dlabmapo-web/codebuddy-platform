-- All private solutions, student work and reviews are authorized by the API.
-- Supabase's client roles must not access these tables through PostgREST.
ALTER TABLE "manual_materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manual_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manual_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manual_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "manual_assets" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "manual_materials", "manual_drafts", "manual_submissions", "manual_reviews", "manual_assets" FROM anon, authenticated;

CREATE OR REPLACE FUNCTION protect_manual_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.material_id,NEW.user_id,NEW.class_id,NEW.files,NEW.answer,NEW.profile,NEW.revision,NEW.maximum_hundredths,NEW.include_in_score,NEW.request_key,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.material_id,OLD.user_id,OLD.class_id,OLD.files,OLD.answer,OLD.profile,OLD.revision,OLD.maximum_hundredths,OLD.include_in_score,OLD.request_key,OLD.created_at)
 THEN RAISE EXCEPTION 'Manual submission snapshots are immutable'; END IF;
 RETURN NEW;
END $$;
