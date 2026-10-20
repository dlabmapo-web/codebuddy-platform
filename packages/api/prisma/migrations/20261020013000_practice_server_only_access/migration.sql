-- Snapshots include hidden expectations. Only the authenticated API/judge may
-- read or write these tables; browser Supabase clients have no direct access.
ALTER TABLE "staff_practice_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_practice_attempts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "staff_practice_drafts", "staff_practice_attempts" FROM anon, authenticated;
