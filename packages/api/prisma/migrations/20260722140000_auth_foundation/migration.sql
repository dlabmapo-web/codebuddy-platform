-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('PENDING_PROFILE', 'ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "AcademyStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "AcademyRole" AS ENUM ('STUDENT', 'TEACHER', 'TEAM_LEAD', 'MANAGER');
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'LEFT');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "auth_user_id" UUID,
  "email" TEXT,
  "display_name" TEXT,
  "avatar_url" TEXT,
  "platform_role" "PlatformRole" NOT NULL DEFAULT 'USER',
  "status" "UserStatus" NOT NULL DEFAULT 'PENDING_PROFILE',
  "legacy_user_id" TEXT,
  "legacy_username" TEXT,
  "legacy_password_hash" TEXT,
  "migrated_at" TIMESTAMPTZ(6),
  "last_sign_in_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organizations" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academies" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "status" "AcademyStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "academies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_memberships" (
  "id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" "AcademyRole" NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
  "invited_by_user_id" UUID,
  "approved_by_user_id" UUID,
  "joined_at" TIMESTAMPTZ(6),
  "suspended_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "academy_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_invitations" (
  "id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "role" "AcademyRole" NOT NULL,
  "token_hash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "invited_by_user_id" UUID NOT NULL,
  "accepted_by_user_id" UUID,
  "accepted_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "academy_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "academy_join_requests" (
  "id" UUID NOT NULL,
  "academy_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "message" TEXT,
  "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
  "approved_role" "AcademyRole",
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMPTZ(6),
  "review_reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "academy_join_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL,
  "actor_user_id" UUID,
  "academy_id" UUID,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "before" JSONB,
  "after" JSONB,
  "request_id" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "reason" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"(lower("email")) WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "users_legacy_user_id_key" ON "users"("legacy_user_id");
CREATE UNIQUE INDEX "users_legacy_username_key" ON "users"("legacy_username");
CREATE INDEX "users_status_idx" ON "users"("status");
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX "academies_organization_id_status_idx" ON "academies"("organization_id", "status");
CREATE UNIQUE INDEX "academies_organization_id_slug_key" ON "academies"("organization_id", "slug");
CREATE INDEX "academy_memberships_user_id_status_idx" ON "academy_memberships"("user_id", "status");
CREATE INDEX "academy_memberships_academy_id_role_status_idx" ON "academy_memberships"("academy_id", "role", "status");
CREATE UNIQUE INDEX "academy_memberships_academy_id_user_id_key" ON "academy_memberships"("academy_id", "user_id");
CREATE UNIQUE INDEX "academy_invitations_token_hash_key" ON "academy_invitations"("token_hash");
CREATE INDEX "academy_invitations_academy_id_email_status_idx" ON "academy_invitations"("academy_id", "email", "status");
CREATE INDEX "academy_invitations_expires_at_status_idx" ON "academy_invitations"("expires_at", "status");
CREATE UNIQUE INDEX "academy_invitations_one_pending_email_key" ON "academy_invitations"("academy_id", lower("email")) WHERE "status" = 'PENDING';
CREATE INDEX "academy_join_requests_academy_id_status_created_at_idx" ON "academy_join_requests"("academy_id", "status", "created_at");
CREATE INDEX "academy_join_requests_user_id_status_idx" ON "academy_join_requests"("user_id", "status");
CREATE UNIQUE INDEX "academy_join_requests_one_pending_key" ON "academy_join_requests"("academy_id", "user_id") WHERE "status" = 'PENDING';
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_academy_id_created_at_idx" ON "audit_logs"("academy_id", "created_at");
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "academies" ADD CONSTRAINT "academies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academy_memberships" ADD CONSTRAINT "academy_memberships_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_memberships" ADD CONSTRAINT "academy_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_memberships" ADD CONSTRAINT "academy_memberships_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "academy_memberships" ADD CONSTRAINT "academy_memberships_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "academy_invitations" ADD CONSTRAINT "academy_invitations_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_invitations" ADD CONSTRAINT "academy_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "academy_invitations" ADD CONSTRAINT "academy_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "academy_join_requests" ADD CONSTRAINT "academy_join_requests_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_join_requests" ADD CONSTRAINT "academy_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academy_join_requests" ADD CONSTRAINT "academy_join_requests_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
