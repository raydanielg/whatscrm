-- Profiles are intentionally self-readable only ("profiles select own": id =
-- auth.uid()), so the organization Danger Zone's "Transfer ownership" picker
-- (useOrgMembers querying organization_members + profiles directly from the
-- browser) could only ever see the current user's own profile row and fell
-- back to "Member <id>" for every other member. Mirrors the existing
-- get_workspace_member_directory (20261019150000) pattern for organizations.
CREATE OR REPLACE FUNCTION public.get_organization_member_directory(_organization_id uuid)
RETURNS TABLE (
  user_id uuid,
  role public.org_role,
  joined_at timestamptz,
  display_name text,
  full_name text,
  email text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    member.user_id,
    member.role,
    member.joined_at,
    profile.display_name,
    profile.full_name,
    profile.email,
    profile.avatar_url
  FROM public.organization_members AS member
  LEFT JOIN public.profiles AS profile ON profile.id = member.user_id
  WHERE member.organization_id = _organization_id
    AND public.is_org_member(_organization_id, auth.uid())
  ORDER BY member.joined_at;
$$;

REVOKE ALL ON FUNCTION public.get_organization_member_directory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_organization_member_directory(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
