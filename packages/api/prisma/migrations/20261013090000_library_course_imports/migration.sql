CREATE TABLE "library_course_imports" (
  "id" UUID NOT NULL,
  "library_course_id" UUID NOT NULL,
  "request_key" UUID NOT NULL,
  "actor_user_id" UUID NOT NULL,
  "source_academy_id" UUID NOT NULL,
  "source_course_id" UUID NOT NULL,
  "source_academy_name" TEXT NOT NULL,
  "source_course_title" TEXT NOT NULL,
  "source_content_revision" INTEGER NOT NULL CHECK ("source_content_revision" > 0),
  "destination_title" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "library_course_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "library_course_imports_library_course_id_fkey" FOREIGN KEY ("library_course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "library_course_imports_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "library_course_imports_library_course_id_key" ON "library_course_imports"("library_course_id");
CREATE UNIQUE INDEX "library_course_imports_request_key_key" ON "library_course_imports"("request_key");

-- Origin and retry receipts are available through the authorized application API only.
ALTER TABLE "library_course_imports" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "library_course_imports" FROM anon, authenticated;
