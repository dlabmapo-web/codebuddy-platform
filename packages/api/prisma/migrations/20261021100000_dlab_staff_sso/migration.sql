BEGIN;
ALTER TABLE dlab_campuses
  ADD COLUMN sso_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN sso_enabled_by_user_id UUID,
  ADD COLUMN sso_enabled_at TIMESTAMPTZ(6),
  ADD COLUMN access_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE dlab_membership_bindings
  ADD COLUMN source_access_status TEXT NOT NULL DEFAULT 'BLOCKED' CHECK (source_access_status IN ('ALLOWED','BLOCKED')),
  ADD COLUMN local_suspended_at TIMESTAMPTZ(6);
CREATE INDEX dlab_identities_external_campus_ids_idx ON dlab_identities USING GIN (external_campus_ids);
CREATE TABLE dlab_integration_events (
  id UUID PRIMARY KEY,
  external_user_id VARCHAR(64),
  request_id UUID,
  action TEXT NOT NULL,
  revision INTEGER,
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX dlab_integration_events_external_user_id_created_at_idx ON dlab_integration_events(external_user_id, created_at);
-- Preserve ambiguous historical local restrictions. New source restrictions have provenance.
UPDATE dlab_membership_bindings b SET local_suspended_at = COALESCE(m.suspended_at, now())
FROM academy_memberships m WHERE m.id = b.membership_id AND m.status <> 'ACTIVE';
UPDATE dlab_membership_bindings b SET source_access_status = 'ALLOWED'
FROM dlab_identities i, dlab_campuses c, academy_memberships m, academies a
WHERE i.external_user_id = b.external_user_id AND c.external_campus_id = b.external_campus_id
AND m.id = b.membership_id AND a.id = c.academy_id AND m.academy_id = c.academy_id
AND i.account_status = 'active' AND c.status = 'active' AND a.status = 'ACTIVE' AND a.kind = 'ACADEMY'
AND i.user_role = 'student' AND i.external_campus_id = b.external_campus_id
AND i.external_campus_ids = ARRAY[i.external_campus_id::text];
-- Canonical hashes are rebuilt by the reconciler from persisted values, before
-- comparing incoming versions. No upstream timestamp is invented by migration.
UPDATE dlab_identities SET external_campus_ids = ARRAY(SELECT DISTINCT unnest(external_campus_ids) ORDER BY 1);

CREATE OR REPLACE FUNCTION cove_guard_dlab_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bound dlab_membership_bindings; managed BOOLEAN;
BEGIN
  IF current_setting('cove.dlab_sync', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM dlab_identities WHERE user_id = OLD.user_id) THEN
      RAISE EXCEPTION 'DLAB membership deletion is managed by OS' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;
  SELECT EXISTS(SELECT 1 FROM dlab_identities WHERE user_id = NEW.user_id) INTO managed;
  IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM dlab_identities WHERE user_id = OLD.user_id) THEN managed := true; END IF;
  IF NOT managed THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'DLAB membership must be reconciled by OS' USING ERRCODE = '42501'; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.academy_id IS DISTINCT FROM OLD.academy_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'DLAB membership fields are managed by OS' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO bound FROM dlab_membership_bindings WHERE membership_id = OLD.id FOR UPDATE;
  IF bound.membership_id IS NULL THEN RAISE EXCEPTION 'DLAB membership is not bound' USING ERRCODE = '42501'; END IF;
  IF current_setting('cove.dlab_restore', true) = 'on' THEN
    UPDATE dlab_membership_bindings SET local_suspended_at = NULL WHERE membership_id = OLD.id;
    IF bound.source_access_status <> 'ALLOWED' OR NOT EXISTS (
      SELECT 1 FROM dlab_identities i JOIN users u ON u.id = i.user_id
      JOIN dlab_campuses c ON c.external_campus_id = bound.external_campus_id
      JOIN academies a ON a.id = c.academy_id
      WHERE i.external_user_id = bound.external_user_id AND i.account_status = 'active'
        AND u.id = OLD.user_id AND u.status = 'ACTIVE' AND a.id = OLD.academy_id
        AND a.status = 'ACTIVE' AND c.status = 'active'
    ) THEN NEW.status := 'SUSPENDED'; NEW.suspended_at := COALESCE(OLD.suspended_at, now()); END IF;
  ELSIF NEW.status = 'ACTIVE' AND OLD.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'DLAB restoration requires source eligibility' USING ERRCODE = '42501';
  ELSIF NEW.status <> 'ACTIVE' THEN
    UPDATE dlab_membership_bindings SET local_suspended_at = COALESCE(local_suspended_at, now()) WHERE membership_id = OLD.id;
  ELSE RETURN NEW;
  END IF;
  UPDATE dlab_identities SET generation = generation + 1, revision = revision + 1 WHERE user_id = OLD.user_id;
  RETURN NEW;
END $$;
DROP TRIGGER cove_dlab_membership_fields ON academy_memberships;
CREATE TRIGGER cove_dlab_membership_fields BEFORE INSERT OR UPDATE OR DELETE ON academy_memberships FOR EACH ROW EXECUTE FUNCTION cove_guard_dlab_membership();

CREATE OR REPLACE FUNCTION cove_guard_dlab_extra_role() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mid UUID;
BEGIN
  IF current_setting('cove.dlab_sync', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN mid := OLD.membership_id; ELSE mid := NEW.membership_id; END IF;
  IF EXISTS (SELECT 1 FROM dlab_membership_bindings WHERE membership_id = mid)
     OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM dlab_membership_bindings WHERE membership_id = OLD.membership_id)) THEN
    RAISE EXCEPTION 'DLAB roles are managed by OS' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
DROP TRIGGER cove_dlab_extra_role ON academy_membership_roles;
CREATE TRIGGER cove_dlab_extra_role BEFORE INSERT OR UPDATE OR DELETE ON academy_membership_roles FOR EACH ROW EXECUTE FUNCTION cove_guard_dlab_extra_role();

CREATE FUNCTION cove_guard_dlab_binding() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('cove.dlab_sync', true) = 'on' OR pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'DLAB bindings are integration managed' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER cove_dlab_binding_guard BEFORE INSERT OR UPDATE OR DELETE ON dlab_membership_bindings FOR EACH ROW EXECUTE FUNCTION cove_guard_dlab_binding();
CREATE FUNCTION cove_guard_dlab_identity_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('cove.dlab_sync', true) <> 'on' OR current_setting('cove.dlab_sync', true) IS NULL THEN
    RAISE EXCEPTION 'DLAB identity deletion is integration managed' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER cove_dlab_identity_delete BEFORE DELETE ON dlab_identities FOR EACH ROW EXECUTE FUNCTION cove_guard_dlab_identity_delete();
CREATE FUNCTION cove_dlab_local_account_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE dlab_identities SET generation = generation + 1, revision = revision + 1 WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cove_dlab_local_account_changed AFTER UPDATE OF status ON users FOR EACH ROW EXECUTE FUNCTION cove_dlab_local_account_changed();
CREATE FUNCTION cove_dlab_local_academy_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE dlab_identities SET generation = generation + 1, revision = revision + 1
    WHERE external_user_id IN (SELECT external_user_id FROM dlab_membership_bindings b JOIN academy_memberships m ON m.id = b.membership_id WHERE m.academy_id = NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cove_dlab_local_academy_changed AFTER UPDATE OF status ON academies FOR EACH ROW EXECUTE FUNCTION cove_dlab_local_academy_changed();

CREATE TRIGGER cove_dlab_identity_write BEFORE INSERT OR UPDATE ON dlab_identities FOR EACH ROW EXECUTE FUNCTION cove_guard_dlab_binding();
ALTER TABLE dlab_campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlab_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlab_membership_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlab_integration_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dlab_campuses, dlab_identities, dlab_membership_bindings, dlab_integration_events FROM anon, authenticated;

COMMIT;
