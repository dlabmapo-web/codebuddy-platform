ALTER TYPE "MaterialType" ADD VALUE 'PDF_DOCUMENT';
CREATE TYPE "PdfPlacement" AS ENUM ('MAIN', 'SUPPLEMENTARY', 'BOTH');
CREATE TYPE "PdfAssetState" AS ENUM ('PENDING', 'READY', 'DELETING', 'DELETED');
CREATE TABLE "pdf_assets" (
  "id" UUID PRIMARY KEY,
  "object_key" TEXT NOT NULL UNIQUE,
  "original_filename" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL CHECK ("byte_size" BETWEEN 1 AND 95000000),
  "checksum_sha256" TEXT NOT NULL,
  "page_count" INTEGER NOT NULL DEFAULT 0 CHECK ("page_count" >= 0),
  "uploader_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "academy_id" UUID NOT NULL, "course_id" UUID NOT NULL, "lecture_id" UUID NOT NULL,
  "state" "PdfAssetState" NOT NULL DEFAULT 'PENDING',
  "consumed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "pdf_assets_state_created_at_idx" ON "pdf_assets"("state", "created_at");
CREATE TABLE "pdf_documents" (
  "material_id" UUID PRIMARY KEY REFERENCES "materials"("id") ON DELETE CASCADE,
  "asset_id" UUID NOT NULL REFERENCES "pdf_assets"("id") ON DELETE RESTRICT,
  "placement" "PdfPlacement" NOT NULL DEFAULT 'MAIN',
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0)
);
CREATE INDEX "pdf_documents_asset_id_idx" ON "pdf_documents"("asset_id");
