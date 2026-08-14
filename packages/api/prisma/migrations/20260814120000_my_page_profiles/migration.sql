-- My Page: global account additions, academy-scoped profiles, and the media
-- metadata behind privately stored profile images.
--
-- The shape follows docs/superpowers/specs/2026-08-14-my-page-account-academy-
-- profile-design.md. The one structural decision worth restating here: every
-- academy profile is keyed by *membership*, not by user. One account can be a
-- student in Mapo and a teacher in Gangnam, and neither academy's manager may
-- reach the other's view of them.

CREATE TYPE "MediaAssetPurpose" AS ENUM ('USER_AVATAR', 'ACADEMY_MEMBER_AVATAR');

CREATE TYPE "GuardianRelationship" AS ENUM (
  'MOTHER',
  'FATHER',
  'GRANDPARENT',
  'SIBLING',
  'LEGAL_GUARDIAN',
  'OTHER'
);

-- One stored object in the private profile-image bucket.
--
-- `uploader_user_id` records who performed the upload and decides nothing
-- about who may view the image: a manager who uploads a student's photo does
-- not thereby own it. Business ownership lives on the profile relations below.
CREATE TABLE "media_assets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bucket" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "purpose" "MediaAssetPurpose" NOT NULL,
  "uploader_user_id" UUID NOT NULL,
  "content_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "checksum_sha256" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "superseded_at" TIMESTAMPTZ(6),
  "deleted_at" TIMESTAMPTZ(6),

  CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- Object keys are immutable, so replacing a photo writes a new row rather than
-- updating this one. The unique index is what makes that a database fact.
CREATE UNIQUE INDEX "media_assets_object_key_key"
  ON "media_assets" ("object_key");

-- The cleanup sweep: superseded and orphaned objects, oldest first.
CREATE INDEX "media_assets_superseded_at_created_at_idx"
  ON "media_assets" ("superseded_at", "created_at");

CREATE INDEX "media_assets_purpose_created_at_idx"
  ON "media_assets" ("purpose", "created_at");

-- Restrict, not Cascade: deleting the uploader must not delete a student's
-- photo. Account deletion schedules the object separately, per §10.4.
ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_uploader_user_id_fkey"
  FOREIGN KEY ("uploader_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Global account additions. `avatar_url` already exists and stays as the
-- external OAuth fallback; `avatar_asset_id` supersedes it once Cove holds an
-- image of its own.
ALTER TABLE "users"
  ADD COLUMN "avatar_asset_id" UUID,
  ADD COLUMN "contact_phone" TEXT,
  ADD COLUMN "preferred_locale" TEXT NOT NULL DEFAULT 'ko',
  ADD COLUMN "timezone" TEXT;

ALTER TABLE "users"
  ADD CONSTRAINT "users_avatar_asset_id_fkey"
  FOREIGN KEY ("avatar_asset_id") REFERENCES "media_assets" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The academy-scoped presentation of one member, whatever their role.
-- Every column is an override: a NULL reveals the global value beneath it
-- rather than blanking the name or the photo.
CREATE TABLE "academy_member_profiles" (
  "membership_id" UUID NOT NULL,
  "academy_display_name" TEXT,
  "avatar_asset_id" UUID,
  "contact_phone" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "academy_member_profiles_pkey" PRIMARY KEY ("membership_id")
);

ALTER TABLE "academy_member_profiles"
  ADD CONSTRAINT "academy_member_profiles_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "academy_member_profiles"
  ADD CONSTRAINT "academy_member_profiles_avatar_asset_id_fkey"
  FOREIGN KEY ("avatar_asset_id") REFERENCES "media_assets" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- A student's academy record. Created lazily on first edit and never deleted
-- by a role change: a member promoted to teacher and later corrected back must
-- not have lost their guardian details in between.
CREATE TABLE "student_academy_profiles" (
  "membership_id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "date_of_birth" DATE,
  "school_name" TEXT,
  "school_grade" TEXT,
  "guardian_name" TEXT,
  "guardian_relationship" "GuardianRelationship",
  "guardian_phone" TEXT,
  "emergency_contact_name" TEXT,
  "emergency_contact_phone" TEXT,
  "coding_interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "learning_goal" TEXT,
  "student_number" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "student_academy_profiles_pkey" PRIMARY KEY ("membership_id")
);

-- Academy-local uniqueness. Postgres treats NULLs as distinct, so every
-- student without a number coexists and only two identical numbers collide.
CREATE UNIQUE INDEX "student_academy_profiles_academy_id_student_number_key"
  ON "student_academy_profiles" ("academy_id", "student_number");

ALTER TABLE "student_academy_profiles"
  ADD CONSTRAINT "student_academy_profiles_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- One shape for TEACHER, TEAM_LEAD, and MANAGER. Those roles differ in
-- authority, not in biography, and the profile never implies a permission.
CREATE TABLE "staff_academy_profiles" (
  "membership_id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "bio" TEXT,
  "specialties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "teaching_languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "academy_title" TEXT,
  "employee_number" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "staff_academy_profiles_pkey" PRIMARY KEY ("membership_id")
);

CREATE UNIQUE INDEX "staff_academy_profiles_academy_id_employee_number_key"
  ON "staff_academy_profiles" ("academy_id", "employee_number");

ALTER TABLE "staff_academy_profiles"
  ADD CONSTRAINT "staff_academy_profiles_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "academy_memberships" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
