-- CreateTable
CREATE TABLE "dlab_campuses" (
    "external_campus_id" VARCHAR(64) NOT NULL,
    "name" TEXT NOT NULL,
    "campus_type" TEXT,
    "status" TEXT NOT NULL,
    "source_updated_at" TIMESTAMPTZ(6),
    "payload_hash" TEXT NOT NULL,
    "academy_id" UUID,
    "mapped_by_user_id" UUID,
    "mapped_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dlab_campuses_pkey" PRIMARY KEY ("external_campus_id")
);

-- CreateTable
CREATE TABLE "dlab_identities" (
    "external_user_id" VARCHAR(64) NOT NULL,
    "user_id" UUID,
    "reserved_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "grade" TEXT,
    "user_role" TEXT NOT NULL,
    "account_status" TEXT NOT NULL,
    "external_campus_id" VARCHAR(64) NOT NULL,
    "external_campus_ids" TEXT[],
    "source_updated_at" TIMESTAMPTZ(6),
    "payload_hash" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "provisioning_status" TEXT NOT NULL DEFAULT 'PENDING',
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dlab_identities_pkey" PRIMARY KEY ("external_user_id")
);

-- CreateTable
CREATE TABLE "dlab_membership_bindings" (
    "external_user_id" VARCHAR(64) NOT NULL,
    "external_campus_id" VARCHAR(64) NOT NULL,
    "membership_id" UUID NOT NULL,
    "applied_revision" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dlab_membership_bindings_pkey" PRIMARY KEY ("external_user_id","external_campus_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dlab_campuses_academy_id_key" ON "dlab_campuses"("academy_id");

-- CreateIndex
CREATE UNIQUE INDEX "dlab_identities_user_id_key" ON "dlab_identities"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "dlab_identities_reserved_user_id_key" ON "dlab_identities"("reserved_user_id");

-- CreateIndex
CREATE INDEX "dlab_identities_external_campus_id_idx" ON "dlab_identities"("external_campus_id");

-- CreateIndex
CREATE UNIQUE INDEX "dlab_membership_bindings_membership_id_key" ON "dlab_membership_bindings"("membership_id");

-- AddForeignKey
ALTER TABLE "dlab_campuses" ADD CONSTRAINT "dlab_campuses_academy_id_fkey" FOREIGN KEY ("academy_id") REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dlab_identities" ADD CONSTRAINT "dlab_identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dlab_membership_bindings" ADD CONSTRAINT "dlab_membership_bindings_external_user_id_fkey" FOREIGN KEY ("external_user_id") REFERENCES "dlab_identities"("external_user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dlab_membership_bindings" ADD CONSTRAINT "dlab_membership_bindings_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "academy_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Protect OS-owned fields across all application mutation paths, including bulk/admin.
-- Only the integration's transaction-local reconciliation path may change them.
CREATE FUNCTION cove_guard_dlab_user() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('cove.dlab_sync', true) = 'on' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM dlab_identities WHERE user_id = OLD.id) AND
    (NEW.display_name IS DISTINCT FROM OLD.display_name OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.email IS DISTINCT FROM OLD.email OR NEW.username IS DISTINCT FROM OLD.username
     OR NEW.platform_role IS DISTINCT FROM OLD.platform_role) THEN
    RAISE EXCEPTION 'DLAB identity fields are managed by OS' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cove_dlab_user_fields BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION cove_guard_dlab_user();

CREATE FUNCTION cove_guard_dlab_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('cove.dlab_sync', true) = 'on' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM dlab_identities WHERE user_id = NEW.user_id) THEN
    IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'DLAB membership must be reconciled by OS' USING ERRCODE = '42501'; END IF;
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.academy_id IS DISTINCT FROM OLD.academy_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR (OLD.status <> 'ACTIVE' AND NEW.status = 'ACTIVE') THEN
      RAISE EXCEPTION 'DLAB membership fields are managed by OS' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cove_dlab_membership_fields BEFORE INSERT OR UPDATE ON academy_memberships FOR EACH ROW EXECUTE FUNCTION cove_guard_dlab_membership();

CREATE FUNCTION cove_guard_dlab_extra_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM dlab_membership_bindings WHERE membership_id = NEW.membership_id) THEN
    RAISE EXCEPTION 'DLAB roles are managed by OS' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cove_dlab_extra_role BEFORE INSERT OR UPDATE ON academy_membership_roles FOR EACH ROW EXECUTE FUNCTION cove_guard_dlab_extra_role();

CREATE FUNCTION cove_guard_dlab_grade() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('cove.dlab_sync', true) = 'on' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM dlab_membership_bindings WHERE membership_id = NEW.membership_id) THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.school_grade IS NOT NULL THEN RAISE EXCEPTION 'DLAB grade is managed by OS' USING ERRCODE = '42501'; END IF;
    ELSIF NEW.school_grade IS DISTINCT FROM OLD.school_grade THEN
      RAISE EXCEPTION 'DLAB grade is managed by OS' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cove_dlab_grade BEFORE INSERT OR UPDATE ON student_academy_profiles FOR EACH ROW EXECUTE FUNCTION cove_guard_dlab_grade();

CREATE FUNCTION cove_guard_dlab_display_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('cove.dlab_sync', true) = 'on' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM dlab_membership_bindings WHERE membership_id = NEW.membership_id) THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.academy_display_name IS NOT NULL THEN RAISE EXCEPTION 'DLAB name is managed by OS' USING ERRCODE = '42501'; END IF;
    ELSIF NEW.academy_display_name IS DISTINCT FROM OLD.academy_display_name THEN
      RAISE EXCEPTION 'DLAB name is managed by OS' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cove_dlab_display_name BEFORE INSERT OR UPDATE ON academy_member_profiles FOR EACH ROW EXECUTE FUNCTION cove_guard_dlab_display_name();
