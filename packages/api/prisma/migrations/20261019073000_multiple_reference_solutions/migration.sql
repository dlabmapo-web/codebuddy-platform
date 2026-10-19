CREATE TABLE "programming_exercise_solutions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "material_id" UUID NOT NULL,
  "position" INTEGER NOT NULL CHECK ("position" >= 0),
  "title" VARCHAR(80),
  "code" TEXT NOT NULL,
  CONSTRAINT "programming_exercise_solutions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "programming_exercise_solutions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "programming_exercises"("material_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "programming_exercise_solutions_material_id_position_key" ON "programming_exercise_solutions"("material_id", "position");
INSERT INTO "programming_exercise_solutions" ("material_id", "position", "code")
SELECT "material_id", 0, "solution_code" FROM "programming_exercises"
WHERE "solution_code" IS NOT NULL AND "solution_code" ~ '[^[:space:]]' AND "quiz" IS NULL;
