-- Optional Supabase project-owner installation. Not run by application migrations.
-- Apply in the project's SQL editor after review; test with a dedicated DLAB identity.
-- This must be installed and tested before enabling real students.
BEGIN;
CREATE OR REPLACE FUNCTION public.cove_guard_dlab_auth() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- GoTrue may generate an unknown random password hash for a passwordless
  -- admin-created identity. The trusted provisioning API never accepts a
  -- password. Preserve the provider's initial hash; prohibit later changes.
  IF TG_OP = 'UPDATE' AND OLD.raw_app_meta_data->>'dlab_managed' = 'true' THEN
    IF NEW.raw_app_meta_data->>'dlab_managed' IS DISTINCT FROM 'true'
      OR NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password
      OR NEW.email IS DISTINCT FROM OLD.email
      OR COALESCE(NEW.email_change, '') <> ''
      OR NEW.phone IS DISTINCT FROM OLD.phone THEN
      RAISE EXCEPTION 'DLAB authentication is managed by OS';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cove_dlab_auth_guard ON auth.users;
CREATE TRIGGER cove_dlab_auth_guard BEFORE INSERT OR UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.cove_guard_dlab_auth();

CREATE OR REPLACE FUNCTION public.cove_guard_dlab_provider() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.provider <> 'email' AND EXISTS (SELECT 1 FROM auth.users WHERE id = NEW.user_id AND raw_app_meta_data->>'dlab_managed' = 'true') THEN
    RAISE EXCEPTION 'DLAB accounts cannot add an alternate provider';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.cove_guard_dlab_provider() FROM PUBLIC;
DROP TRIGGER IF EXISTS cove_dlab_provider_guard ON auth.identities;
CREATE TRIGGER cove_dlab_provider_guard BEFORE INSERT OR UPDATE ON auth.identities FOR EACH ROW EXECUTE FUNCTION public.cove_guard_dlab_provider();
COMMIT;
-- Rollback requires explicit owner review: drop these two triggers, then functions.
-- Removing guards must be paired with disabling SSO and invalidating managed sessions.
