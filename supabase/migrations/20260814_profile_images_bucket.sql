-- The private bucket behind Cove profile images.
--
-- Run this in Supabase Dashboard → SQL Editor.
--
-- Deliberately NOT the existing public rich-text upload bucket. A public
-- bucket URL bypasses read access control entirely, and a Cove profile image
-- can identify a minor. Every read goes through the API, which authorizes the
-- caller against Cove's own membership rules and then mints a short-lived
-- signed URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images',
  'profile-images',
  false,
  -- The normalized WebP the API writes is under 512 KiB. The limit here is a
  -- backstop against a bug in Cove, not the input limit — the 5 MiB cap on
  -- what a person may upload is enforced before the image is ever decoded.
  1048576,
  array['image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Deny by default for every browser identity.
--
-- No policy is created for this bucket on purpose. RLS on `storage.objects` is
-- already enabled by Supabase, so with no matching policy an anonymous or
-- signed-in browser client can neither read, write, nor list these objects.
-- The API uses the service-role key, which bypasses RLS and is server-only.
--
-- If an accidental direct client upload ever starts succeeding, that is the
-- signal that a policy was added here by mistake — not that the API changed.
--
-- The check below fails the migration loudly rather than leaving a bucket that
-- looks private and is not.
do $$
begin
  if exists (
    select 1 from storage.buckets where id = 'profile-images' and public
  ) then
    raise exception 'profile-images must stay private';
  end if;
end;
$$;
