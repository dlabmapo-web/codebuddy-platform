-- Scalable people operations: import, bulk mutations, and invitation delivery.
--
-- Follows docs/superpowers/specs/2026-08-18-manager-control-tower-and-scalable-
-- people-operations-design.md §8.1–§8.4.
--
-- Three ideas shape the tables below.
--
-- A preview is durable. The normalized rows a manager acknowledged are stored
-- and committed verbatim, so a code change between preview and commit cannot
-- silently apply a different normalization to rows somebody already approved.
--
-- Every long-running operation carries an idempotency key that is unique
-- within its academy. A retry after a lost response returns the original
-- result rather than inviting two hundred people twice.
--
-- Delivery state is never invitation state. An invitation can be pending while
-- its email bounced, and accepted while its email is still only SENT. Two
-- columns, because collapsing them would make the interface claim provider
-- evidence it does not have.

ALTER TYPE "MediaAssetPurpose" ADD VALUE IF NOT EXISTS 'ACADEMY_COVER';
ALTER TYPE "MediaAssetPurpose" ADD VALUE IF NOT EXISTS 'ACADEMY_GALLERY';

CREATE TYPE "AcademyMediaKind" AS ENUM ('COVER', 'GALLERY');

CREATE TYPE "PeopleImportStatus" AS ENUM (
  'PREVIEW_READY',
  'COMMITTING',
  'COMPLETED',
  'EXPIRED',
  'FAILED'
);

CREATE TYPE "PeopleBulkKind" AS ENUM (
  'ENROLL',
  'ROLE_CHANGE',
  'SUSPEND',
  'RESTORE'
);

CREATE TYPE "PeopleBulkStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TYPE "InvitationDeliveryState" AS ENUM (
  'QUEUED',
  'SENT',
  'DELIVERED',
  'BOUNCED',
  'FAILED'
);

-- Import may suggest a name but never renames a global account. On acceptance
-- this seeds the academy-scoped override, and only if the recipient has not
-- already chosen one.
ALTER TABLE "academy_invitations"
  ADD COLUMN "display_name_hint" TEXT;

CREATE TABLE "academy_media" (
  "id"         UUID PRIMARY KEY,
  "academy_id" UUID NOT NULL,
  "asset_id"   UUID NOT NULL,
  "kind"       "AcademyMediaKind" NOT NULL,
  "position"   INTEGER NOT NULL DEFAULT 0,
  "alt_text"   TEXT,
  "is_decorative" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "academy_media_academy_id_fkey"
    FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "academy_media_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "media_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "academy_media_one_cover_key"
  ON "academy_media" ("academy_id") WHERE "kind" = 'COVER';
CREATE UNIQUE INDEX "academy_media_gallery_position_key"
  ON "academy_media" ("academy_id", "position") WHERE "kind" = 'GALLERY';
CREATE INDEX "academy_media_academy_id_kind_position_idx"
  ON "academy_media" ("academy_id", "kind", "position");

CREATE TABLE "people_import_sessions" (
  "id"                       UUID PRIMARY KEY,
  "academy_id"               UUID NOT NULL,
  "actor_user_id"            UUID NOT NULL,
  "original_filename"        TEXT NOT NULL,
  "checksum_sha256"          TEXT NOT NULL,
  "status"                   "PeopleImportStatus" NOT NULL DEFAULT 'PREVIEW_READY',
  "total_rows"               INTEGER NOT NULL,
  "ready_rows"               INTEGER NOT NULL,
  "warning_rows"             INTEGER NOT NULL,
  "error_rows"               INTEGER NOT NULL,
  "preview"                  JSONB NOT NULL,
  "captured_people_revision" INTEGER NOT NULL,
  "expires_at"               TIMESTAMPTZ(6) NOT NULL,
  "idempotency_key"          TEXT NOT NULL,
  "committed_at"             TIMESTAMPTZ(6),
  "result"                   JSONB,
  "failure_code"             TEXT,
  "created_at"               TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "people_import_sessions_academy_id_fkey"
    FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "people_import_sessions_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "people_import_sessions_academy_id_idempotency_key_key"
  ON "people_import_sessions" ("academy_id", "idempotency_key");
CREATE INDEX "people_import_sessions_academy_id_status_created_at_idx"
  ON "people_import_sessions" ("academy_id", "status", "created_at");
-- The expiry sweep reads this, and only this.
CREATE INDEX "people_import_sessions_expires_at_idx"
  ON "people_import_sessions" ("expires_at");

CREATE TABLE "people_bulk_operations" (
  "id"              UUID PRIMARY KEY,
  "academy_id"      UUID NOT NULL,
  "actor_user_id"   UUID NOT NULL,
  "kind"            "PeopleBulkKind" NOT NULL,
  "selection"       JSONB NOT NULL,
  "requested_count" INTEGER NOT NULL,
  "succeeded_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count"    INTEGER NOT NULL DEFAULT 0,
  "status"          "PeopleBulkStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" TEXT NOT NULL,
  "result"          JSONB,
  "failure_code"    TEXT,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "people_bulk_operations_academy_id_fkey"
    FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "people_bulk_operations_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Scoped by kind as well as academy: "suspend these forty" and "enrol these
-- forty" are different operations and may legitimately share a client key.
CREATE UNIQUE INDEX "people_bulk_operations_academy_id_kind_idempotency_key_key"
  ON "people_bulk_operations" ("academy_id", "kind", "idempotency_key");
CREATE INDEX "people_bulk_operations_academy_id_created_at_idx"
  ON "people_bulk_operations" ("academy_id", "created_at");

CREATE TABLE "invitation_delivery_attempts" (
  "id"                  UUID PRIMARY KEY,
  "invitation_id"       UUID NOT NULL,
  "attempt_number"      INTEGER NOT NULL,
  "provider_message_id" TEXT,
  "state"               "InvitationDeliveryState" NOT NULL DEFAULT 'QUEUED',
  "failure_code"        TEXT,
  "queued_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at"             TIMESTAMPTZ(6),
  "delivered_at"        TIMESTAMPTZ(6),
  "failed_at"           TIMESTAMPTZ(6),
  "last_event_key"      TEXT,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "invitation_delivery_attempts_invitation_id_fkey"
    FOREIGN KEY ("invitation_id") REFERENCES "academy_invitations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "invitation_delivery_attempts_invitation_id_attempt_number_key"
  ON "invitation_delivery_attempts" ("invitation_id", "attempt_number");
-- Every provider redelivers webhooks. This is what makes the second delivery
-- of one event a no-op rather than a second state transition.
CREATE UNIQUE INDEX "invitation_delivery_attempts_last_event_key_key"
  ON "invitation_delivery_attempts" ("last_event_key");
-- The dispatcher's queue: attempts left QUEUED by a crash, oldest first.
CREATE INDEX "invitation_delivery_attempts_state_queued_at_idx"
  ON "invitation_delivery_attempts" ("state", "queued_at");
-- Webhooks arrive naming the provider's id, not ours.
CREATE INDEX "invitation_delivery_attempts_provider_message_id_idx"
  ON "invitation_delivery_attempts" ("provider_message_id");
