-- A workspace invite also needs organization visibility so the invited user
-- can find that workspace in the organization switcher. Guest is the least
-- privileged organization role; workspace_members.role still controls access
-- to the invited workspace.
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv public.workspace_invitations%ROWTYPE;
  _uid uuid := auth.uid();
  _org_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _inv
  FROM public.workspace_invitations
  WHERE token = _token
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF _inv.status <> 'pending' THEN RAISE EXCEPTION 'Invitation is %', _inv.status; END IF;
  IF _inv.expires_at < now() THEN
    UPDATE public.workspace_invitations SET status = 'expired' WHERE id = _inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = _uid AND lower(email) = lower(_inv.email)
  ) THEN
    RAISE EXCEPTION 'Sign in with the invited email address to accept this invitation';
  END IF;

  SELECT organization_id INTO _org_id
  FROM public.workspaces
  WHERE id = _inv.workspace_id;

  IF _org_id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role, invited_by)
    VALUES (_org_id, _uid, 'guest'::public.org_role, _inv.invited_by)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_inv.workspace_id, _uid, _inv.role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now(), accepted_by = _uid
  WHERE id = _inv.id;

  INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (_inv.workspace_id, _uid, 'invite', 'workspace_member', _uid::text,
    jsonb_build_object('event', 'invitation_accepted', 'invitation_id', _inv.id, 'role', _inv.role));

  RETURN _inv.workspace_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_workspace_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text) TO authenticated;

-- Repair prior successful accepts without restoring revoked/suspended access
-- or changing an existing organization member's role.
INSERT INTO public.organization_members (organization_id, user_id, role, invited_by)
SELECT DISTINCT w.organization_id, i.accepted_by, 'guest'::public.org_role, i.invited_by
FROM public.workspace_invitations i
JOIN public.workspaces w ON w.id = i.workspace_id
JOIN public.workspace_members m ON m.workspace_id = i.workspace_id AND m.user_id = i.accepted_by
JOIN auth.users u ON u.id = i.accepted_by AND lower(u.email) = lower(i.email)
WHERE i.status = 'accepted'
  AND i.accepted_by IS NOT NULL
  AND w.organization_id IS NOT NULL
  AND m.status = 'active'
ON CONFLICT (organization_id, user_id) DO NOTHING;
