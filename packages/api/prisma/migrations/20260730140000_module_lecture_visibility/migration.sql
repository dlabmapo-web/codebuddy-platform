ALTER TABLE "course_modules"
ADD COLUMN "is_published" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "lectures"
ADD COLUMN "is_published" BOOLEAN NOT NULL DEFAULT true;
