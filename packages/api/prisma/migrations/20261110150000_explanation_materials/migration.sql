ALTER TYPE "MaterialType" ADD VALUE 'EXPLANATION';
CREATE TABLE "explanation_materials" (
  "material_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "explanation_materials_pkey" PRIMARY KEY ("material_id"),
  CONSTRAINT "explanation_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "explanation_materials" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "explanation_materials" FROM anon, authenticated;
ALTER TABLE "explanation_materials" ADD CONSTRAINT "explanation_revision_positive" CHECK (revision > 0);
