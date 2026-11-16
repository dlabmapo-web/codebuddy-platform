ALTER TABLE "explanation_materials" ADD COLUMN "side_body" TEXT;
CREATE TABLE "student_material_views" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "material_id" UUID NOT NULL REFERENCES "materials"("id") ON DELETE CASCADE,
  "first_viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_material_views_pkey" PRIMARY KEY ("user_id", "material_id")
);
CREATE INDEX "student_material_views_material_id_idx" ON "student_material_views"("material_id");
ALTER TABLE "student_material_views" ENABLE ROW LEVEL SECURITY;
