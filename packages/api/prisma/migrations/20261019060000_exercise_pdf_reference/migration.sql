ALTER TABLE "programming_exercises" ADD COLUMN "reference_pdf_material_id" UUID;
CREATE INDEX "programming_exercises_reference_pdf_material_id_idx" ON "programming_exercises"("reference_pdf_material_id");
ALTER TABLE "programming_exercises" ADD CONSTRAINT "programming_exercises_reference_pdf_material_id_fkey" FOREIGN KEY ("reference_pdf_material_id") REFERENCES "pdf_documents"("material_id") ON DELETE RESTRICT ON UPDATE CASCADE;
