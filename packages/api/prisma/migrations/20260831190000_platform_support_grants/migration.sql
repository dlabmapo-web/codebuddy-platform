-- One operator's time-limited authority inside one academy: the only bridge
-- between the platform and academy authority axes, and a row rather than a
-- role so that a reason, an expiry, and a revocation are columns.
CREATE TABLE "platform_support_grants" (
    "id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "assumed_role" "AcademyRole" NOT NULL,
    "read_only" BOOLEAN NOT NULL DEFAULT true,
    "allow_monitoring" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_support_grants_pkey" PRIMARY KEY ("id")
);

-- The authorization read, run on every academy request an operator makes.
CREATE INDEX "platform_support_grants_academy_id_admin_user_id_expires_at_idx"
    ON "platform_support_grants"("academy_id", "admin_user_id", "expires_at");
CREATE INDEX "platform_support_grants_admin_user_id_created_at_idx"
    ON "platform_support_grants"("admin_user_id", "created_at" DESC);

ALTER TABLE "platform_support_grants"
    ADD CONSTRAINT "platform_support_grants_academy_id_fkey"
    FOREIGN KEY ("academy_id") REFERENCES "academies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict: an operator's account must not be removable while these rows
-- record what they did with it.
ALTER TABLE "platform_support_grants"
    ADD CONSTRAINT "platform_support_grants_admin_user_id_fkey"
    FOREIGN KEY ("admin_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_support_grants"
    ADD CONSTRAINT "platform_support_grants_revoked_by_user_id_fkey"
    FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Every act performed under a grant points back at it, so the platform's grant
-- page and the academy's own audit page tell the same story about one edit.
ALTER TABLE "audit_logs" ADD COLUMN "support_grant_id" UUID;

CREATE INDEX "audit_logs_support_grant_id_created_at_idx"
    ON "audit_logs"("support_grant_id", "created_at");

ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_support_grant_id_fkey"
    FOREIGN KEY ("support_grant_id") REFERENCES "platform_support_grants"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
