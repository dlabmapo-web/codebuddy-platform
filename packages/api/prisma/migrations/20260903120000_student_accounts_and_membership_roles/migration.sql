-- Students have no email address. Supabase Auth requires one for every
-- identity, so a generated `no-email.cove.invalid` placeholder is stored in
-- `email` and flagged here. Existing accounts all hold a real address, so the
-- default is correct for every row and no backfill is needed.
ALTER TABLE "users"
  ADD COLUMN "email_is_placeholder" BOOLEAN NOT NULL DEFAULT false;

-- Additional roles a member holds in one academy, beside the primary role on
-- `academy_memberships.role`.
CREATE TABLE "academy_membership_roles" (
    "id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role" "AcademyRole" NOT NULL,
    "granted_by_user_id" UUID,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academy_membership_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "academy_membership_roles_membership_id_role_key"
  ON "academy_membership_roles"("membership_id", "role");
CREATE INDEX "academy_membership_roles_membership_id_idx"
  ON "academy_membership_roles"("membership_id");

-- STUDENT is exclusive: a student's rows are about them, while every staff
-- role reads across students. Enforced in the service, and here so no future
-- caller can write the combination the application refuses.
ALTER TABLE "academy_membership_roles"
  ADD CONSTRAINT "academy_membership_roles_no_student"
  CHECK ("role" <> 'STUDENT');

ALTER TABLE "academy_membership_roles"
  ADD CONSTRAINT "academy_membership_roles_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "academy_memberships"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "academy_membership_roles"
  ADD CONSTRAINT "academy_membership_roles_granted_by_user_id_fkey"
  FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The password a manager issued to a student, kept only while it is still the
-- student's password. Destroyed the moment they choose their own, so Cove
-- never holds a secret its owner believes is private.
CREATE TABLE "student_issued_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "auth_tag" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "visible_prefix" TEXT NOT NULL,
    "length" INTEGER NOT NULL,
    "issued_by_user_id" UUID NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reveal_count" INTEGER NOT NULL DEFAULT 0,
    "last_revealed_at" TIMESTAMPTZ(6),

    CONSTRAINT "student_issued_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "student_issued_credentials_user_id_key"
  ON "student_issued_credentials"("user_id");
CREATE INDEX "student_issued_credentials_academy_id_idx"
  ON "student_issued_credentials"("academy_id");

ALTER TABLE "student_issued_credentials"
  ADD CONSTRAINT "student_issued_credentials_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_issued_credentials"
  ADD CONSTRAINT "student_issued_credentials_academy_id_fkey"
  FOREIGN KEY ("academy_id") REFERENCES "academies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict, not cascade: deleting the manager who issued a password must not
-- silently destroy the credential a student is still signing in with.
ALTER TABLE "student_issued_credentials"
  ADD CONSTRAINT "student_issued_credentials_issued_by_user_id_fkey"
  FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
