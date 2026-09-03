-- The content library: head office authors master courses, branches take a
-- complete copy of one into themselves.
--
-- Nothing here changes an existing row's meaning. `courses.academy_id` stays
-- NOT NULL, so every content, class, submission and authorization path is
-- untouched; a library is an academy whose `kind` says it holds curriculum
-- rather than people.

-- What an academy is for. Defaulted, so every existing academy is correct
-- without a backfill.
CREATE TYPE "AcademyKind" AS ENUM ('ACADEMY', 'LIBRARY');

ALTER TABLE "academies"
    ADD COLUMN "kind" "AcademyKind" NOT NULL DEFAULT 'ACADEMY';

-- At most one library per organization. Two would make "the library"
-- ambiguous in every sentence of the branch interface, and there is no
-- sensible rule for choosing between them.
--
-- A partial unique index, which Prisma's schema language cannot express:
-- `@@unique([organization_id, kind])` would forbid an organization having more
-- than one ordinary academy, which is the entire product.
CREATE UNIQUE INDEX "academies_one_library_per_organization"
    ON "academies"("organization_id")
    WHERE "kind" = 'LIBRARY';

-- Where a course came from, when it came from the library. All nullable:
-- every course that exists today was authored in place and has no source.
ALTER TABLE "courses"
    ADD COLUMN "source_course_id" UUID,
    ADD COLUMN "source_content_revision" INTEGER,
    ADD COLUMN "baseline_revision" INTEGER,
    ADD COLUMN "retired_at" TIMESTAMPTZ(6);

-- The fan-out read: every academy's copy of one master.
CREATE INDEX "courses_source_course_id_idx" ON "courses"("source_course_id");

-- RESTRICT, not SET NULL. The database itself refuses to delete a library
-- course while any academy still holds a copy of it; head office retires it
-- instead. Losing this pointer would lose the only record of where a branch's
-- curriculum came from.
ALTER TABLE "courses"
    ADD CONSTRAINT "courses_source_course_id_fkey"
    FOREIGN KEY ("source_course_id") REFERENCES "courses"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
