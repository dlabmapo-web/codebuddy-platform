CREATE TYPE "InputPromptPolicy" AS ENUM ('INCLUDE', 'IGNORE');

ALTER TABLE "programming_exercises" ADD COLUMN "input_prompt_policy" "InputPromptPolicy" NOT NULL DEFAULT 'INCLUDE';
ALTER TABLE "submissions" ADD COLUMN "input_prompt_policy" "InputPromptPolicy" NOT NULL DEFAULT 'INCLUDE';
