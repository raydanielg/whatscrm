-- Profiles are intentionally self-readable only. Expose the small identity
-- subset needed by workspace directories after checking workspace membership.
CREATE OR REPLACE FUNCTION public.get_workspace_member_directory(_workspace_id uuid)
RETURNS TABLE (
  user_id uuid,
  role public.workspace_role,
  status public.member_status,
  created_at timestamptz,
  last_active_at timestamptz,
  display_name text,
  avatar_url text,
  email text,
  last_seen_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    member.user_id,
    member.role,
    member.status,
    member.created_at,
    member.last_active_at,
    profile.display_name,
    profile.avatar_url,
    profile.email,
    profile.last_seen_at
  FROM public.workspace_members AS member
  LEFT JOIN public.profiles AS profile ON profile.id = member.user_id
  WHERE member.workspace_id = _workspace_id
    AND public.is_workspace_member(_workspace_id, auth.uid())
  ORDER BY member.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_workspace_member_directory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_workspace_member_directory(uuid) TO authenticated;
