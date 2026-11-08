-- Invited workspace members (role: owner/admin/agent/viewer) were never
-- getting any page.* / resource permissions. accept_workspace_invitation()
-- only ever wrote a 'guest' row into organization_members and a row into
-- workspace_members — it never touched user_role_assignments, and
-- my_permissions()/has_permission() only grant full access for the legacy
-- org_role owner/admin or for an explicit user_role_assignments row. A
-- 'guest' org member with no role assignment resolves to zero permissions,
-- so invited agents/viewers/admins saw an almost-empty sidebar (no Inbox,
-- no Contacts, etc.) even though their workspace role said otherwise.
--
-- Fix: map the invited workspace_role to the matching system role (from the
-- 20260717102207 seed) and assign it automatically on accept, and backfill
-- everyone already affected.

CREATE OR REPLACE FUNCTION public._system_role_for_workspace_role(_role public.workspace_role)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _role
    WHEN 'owner' THEN 'admin'
    WHEN 'admin' THEN 'admin'
    WHEN 'agent' THEN 'support_agent'
    WHEN 'viewer' THEN 'viewer'
  END;
$$;

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
  _role_id uuid;
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

    SELECT id INTO _role_id
    FROM public.roles
    WHERE organization_id IS NULL
      AND key = public._system_role_for_workspace_role(_inv.role);

    IF _role_id IS NOT NULL THEN
      INSERT INTO public.user_role_assignments (user_id, role_id, organization_id, granted_by)
      VALUES (_uid, _role_id, _org_id, _inv.invited_by)
      ON CONFLICT DO NOTHING;
    END IF;
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

-- Backfill: give every existing workspace member who still has zero role
-- assignments in their org the system role matching their workspace role,
-- so already-invited agents/viewers/admins get unblocked immediately.
INSERT INTO public.user_role_assignments (user_id, role_id, organization_id, granted_by)
SELECT DISTINCT
  wm.user_id,
  r.id,
  w.organization_id,
  NULL::uuid
FROM public.workspace_members wm
JOIN public.workspaces w ON w.id = wm.workspace_id
JOIN public.roles r ON r.organization_id IS NULL
  AND r.key = public._system_role_for_workspace_role(wm.role)
WHERE w.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_role_assignments ura
    WHERE ura.user_id = wm.user_id
      AND (ura.organization_id = w.organization_id OR ura.organization_id IS NULL)
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = w.organization_id
      AND om.user_id = wm.user_id
      AND om.role IN ('owner','admin')
  )
ON CONFLICT DO NOTHING;
