-- TUS authenticates the user before processing the signed object grant.
-- Permit only a server-reserved immutable source key; never grant read/list/update.
CREATE FUNCTION public.can_insert_reserved_video(object_name TEXT) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.video_assets a
  JOIN public.users u ON u.id = a.uploader_user_id
  JOIN public.academies academy ON academy.id = a.academy_id
  WHERE a.object_key = object_name
   AND u.auth_user_id = auth.uid() AND u.status = 'ACTIVE'
   AND academy.status = 'ACTIVE' AND a.state = 'UPLOADING'
   AND a.created_at > now() - interval '24 hours'
   AND (u.platform_role = 'ADMIN' OR EXISTS (
    SELECT 1 FROM public.academy_memberships m
    WHERE m.user_id = u.id AND m.academy_id = a.academy_id AND m.status = 'ACTIVE'
      AND (m.role IN ('TEAM_LEAD','MANAGER') OR EXISTS (
        SELECT 1 FROM public.academy_membership_roles r
        WHERE r.membership_id = m.id AND r.role IN ('TEAM_LEAD','MANAGER')
      ))
   ))
 );
$$;
REVOKE ALL ON FUNCTION public.can_insert_reserved_video(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_insert_reserved_video(TEXT) TO authenticated;
CREATE POLICY video_reserved_source_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id = 'course-videos' AND public.can_insert_reserved_video(name));
