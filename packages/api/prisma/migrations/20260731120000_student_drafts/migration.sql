-- CreateTable
CREATE TABLE "exercise_drafts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exercise_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exercise_drafts_user_id_material_id_key" ON "exercise_drafts"("user_id", "material_id");

-- CreateIndex
CREATE INDEX "exercise_drafts_user_id_updated_at_idx" ON "exercise_drafts"("user_id", "updated_at" DESC);

-- AddForeignKey
ALTER TABLE "exercise_drafts" ADD CONSTRAINT "exercise_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercise_drafts" ADD CONSTRAINT "exercise_drafts_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
