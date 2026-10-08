-- PDF metadata is accessed through the authorized application API only.
-- Supabase's public-schema default grants otherwise expose newly created tables.
ALTER TABLE "pdf_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pdf_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pdf_assets", "pdf_documents" FROM anon, authenticated;
