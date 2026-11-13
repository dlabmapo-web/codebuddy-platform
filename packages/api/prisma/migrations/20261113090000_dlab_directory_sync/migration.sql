BEGIN;
ALTER TABLE dlab_identities
  ADD COLUMN projected_revision INTEGER,
  ADD COLUMN last_provision_error_code TEXT,
  ADD COLUMN last_provision_request_id UUID;
ALTER TABLE dlab_campuses ADD COLUMN local_academy_restriction "AcademyStatus";
ALTER TABLE dlab_campuses ADD CONSTRAINT dlab_local_academy_restriction_check
  CHECK (local_academy_restriction IS NULL OR local_academy_restriction IN ('SUSPENDED','ARCHIVED'));
-- Old restrictions have ambiguous provenance: preserve them, never infer a restore.
UPDATE dlab_campuses c SET local_academy_restriction = a.status
FROM academies a WHERE a.id = c.academy_id AND a.status <> 'ACTIVE';
CREATE INDEX dlab_directory_pending_idx ON dlab_identities (external_user_id)
  WHERE provisioning_status <> 'READY' OR projected_revision IS DISTINCT FROM revision;

-- A mapped name is source-owned on every write path, not just the UI.
CREATE FUNCTION cove_guard_dlab_academy_name() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     AND current_setting('cove.dlab_sync', true) IS DISTINCT FROM 'on'
     AND EXISTS (SELECT 1 FROM dlab_campuses WHERE academy_id = OLD.id) THEN
    RAISE EXCEPTION 'DLAB academy name is managed by OS' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cove_dlab_academy_name BEFORE UPDATE OF name ON academies
  FOR EACH ROW EXECUTE FUNCTION cove_guard_dlab_academy_name();

-- Direct/local lifecycle changes retain independent intent, even when OS has
-- already suspended the row. Source projection uses the transaction-local flag.
CREATE FUNCTION cove_project_dlab_local_academy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c dlab_campuses;
BEGIN
  IF current_setting('cove.dlab_sync', true) = 'on' THEN RETURN NEW; END IF;
  SELECT * INTO c FROM dlab_campuses WHERE academy_id = OLD.id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.status = 'ACTIVE' AND c.status <> 'active' THEN
    RAISE EXCEPTION 'DLAB source campus is inactive' USING ERRCODE = '42501';
  END IF;
  IF c.local_academy_restriction = 'ARCHIVED' AND NEW.status <> 'ARCHIVED' THEN
    RAISE EXCEPTION 'Archived academy cannot be restored' USING ERRCODE = '42501';
  END IF;
  UPDATE dlab_campuses SET local_academy_restriction = CASE WHEN NEW.status = 'ACTIVE' THEN NULL ELSE NEW.status END
  WHERE external_campus_id = c.external_campus_id;
  RETURN NEW;
END $$;
CREATE TRIGGER cove_dlab_local_academy_projection BEFORE UPDATE OF status ON academies
  FOR EACH ROW EXECUTE FUNCTION cove_project_dlab_local_academy();
COMMIT;
