-- Bridge workspace membership roles with the richer system/custom permission roles.
ALTER TABLE public.workspace_invitations
  ADD COLUMN IF NOT EXISTS permission_role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL;

ALTER TABLE public.workspace_auto_invite_rules
  ADD COLUMN IF NOT EXISTS permission_role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public._workspace_role_for_permission_role(_key text)
RETURNS public.workspace_role LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _key
    WHEN 'admin' THEN 'admin'::public.workspace_role
    WHEN 'manager' THEN 'manager'::public.workspace_role
    WHEN 'viewer' THEN 'viewer'::public.workspace_role
    ELSE 'agent'::public.workspace_role
  END;
$$;

CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(_token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv public.workspace_invitations%ROWTYPE;
  _uid uuid := auth.uid();
  _org_id uuid;
  _role_id uuid;
  _role_key text;
  _workspace_role public.workspace_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _inv FROM public.workspace_invitations WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF _inv.status <> 'pending' THEN RAISE EXCEPTION 'Invitation is %', _inv.status; END IF;
  IF _inv.expires_at < now() THEN
    UPDATE public.workspace_invitations SET status = 'expired' WHERE id = _inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _uid AND lower(email) = lower(_inv.email)) THEN
    RAISE EXCEPTION 'Sign in with the invited email address to accept this invitation';
  END IF;

  SELECT organization_id INTO _org_id FROM public.workspaces WHERE id = _inv.workspace_id;
  _role_id := _inv.permission_role_id;
  IF _role_id IS NOT NULL THEN
    SELECT key INTO _role_key FROM public.roles
    WHERE id = _role_id AND key <> 'owner'
      AND (organization_id IS NULL OR organization_id = _org_id);
    IF _role_key IS NULL THEN RAISE EXCEPTION 'The selected invitation role is no longer available'; END IF;
    _workspace_role := public._workspace_role_for_permission_role(_role_key);
  ELSE
    _workspace_role := _inv.role;
    SELECT id INTO _role_id FROM public.roles
    WHERE organization_id IS NULL AND key = public._system_role_for_workspace_role(_workspace_role);
  END IF;

  IF _org_id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, user_id, role, invited_by)
    VALUES (_org_id, _uid, 'guest'::public.org_role, _inv.invited_by)
    ON CONFLICT (organization_id, user_id) DO NOTHING;
    IF _role_id IS NOT NULL THEN
      INSERT INTO public.user_role_assignments (user_id, role_id, organization_id, workspace_id, granted_by)
      VALUES (_uid, _role_id, _org_id, _inv.workspace_id, _inv.invited_by)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_inv.workspace_id, _uid, _workspace_role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';
  UPDATE public.workspace_invitations
  SET status = 'accepted', accepted_at = now(), accepted_by = _uid, role = _workspace_role
  WHERE id = _inv.id;
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (_inv.workspace_id, _uid, 'invite', 'workspace_member', _uid::text,
    jsonb_build_object('event','invitation_accepted','invitation_id',_inv.id,'role',_workspace_role,'permission_role_id',_role_id));
  RETURN _inv.workspace_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_workspace_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_workspace_member_permission_role(
  _workspace_id uuid, _user_id uuid, _role_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org_id uuid;
  _role_key text;
  _caller_role public.workspace_role;
  _workspace_role public.workspace_role;
BEGIN
  SELECT organization_id INTO _org_id FROM public.workspaces WHERE id = _workspace_id;
  SELECT role INTO _caller_role FROM public.workspace_members
   WHERE workspace_id = _workspace_id AND user_id = auth.uid() AND status = 'active';
  IF _caller_role NOT IN ('owner', 'admin') THEN RAISE EXCEPTION 'Only workspace owners and admins can assign roles'; END IF;

  SELECT key INTO _role_key FROM public.roles
   WHERE id = _role_id AND key <> 'owner'
     AND (organization_id IS NULL OR organization_id = _org_id);
  IF _role_key IS NULL THEN RAISE EXCEPTION 'Role is not available in this organization'; END IF;
  IF _role_key = 'admin' AND _caller_role <> 'owner' THEN RAISE EXCEPTION 'Only the workspace owner can assign Admin'; END IF;
  _workspace_role := public._workspace_role_for_permission_role(_role_key);

  UPDATE public.workspace_members SET role = _workspace_role
   WHERE workspace_id = _workspace_id AND user_id = _user_id AND role <> 'owner';
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace member not found or owner role cannot be changed'; END IF;

  DELETE FROM public.user_role_assignments
   WHERE user_id = _user_id AND workspace_id = _workspace_id;
  INSERT INTO public.user_role_assignments(user_id, role_id, organization_id, workspace_id, granted_by)
  VALUES (_user_id, _role_id, _org_id, _workspace_id, auth.uid());
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_workspace_member_permission_role(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_workspace_member_permission_role(uuid, uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_my_auto_invite_rules()
RETURNS TABLE(workspace_id uuid, role public.workspace_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text := lower(coalesce(auth.jwt()->>'email',''));
  _verified boolean := coalesce((auth.jwt()->>'email_verified')::boolean, false);
  _domain text;
  _rule record;
  _org_id uuid;
  _role_id uuid;
  _role_key text;
  _workspace_role public.workspace_role;
BEGIN
  IF _uid IS NULL OR NOT _verified OR _email = '' THEN RETURN; END IF;
  _domain := split_part(_email, '@', 2);
  IF _domain = '' THEN RETURN; END IF;

  FOR _rule IN SELECT r.* FROM public.workspace_auto_invite_rules r
    WHERE r.is_active AND r.domain = _domain
  LOOP
    SELECT w.organization_id INTO _org_id FROM public.workspaces w WHERE w.id = _rule.workspace_id;
    _role_id := _rule.permission_role_id;
    IF _role_id IS NOT NULL THEN
      SELECT rr.key INTO _role_key FROM public.roles rr
       WHERE rr.id = _role_id AND rr.key <> 'owner'
         AND (rr.organization_id IS NULL OR rr.organization_id = _org_id);
      IF _role_key IS NULL THEN CONTINUE; END IF;
      _workspace_role := public._workspace_role_for_permission_role(_role_key);
    ELSE
      _workspace_role := _rule.role;
      SELECT rr.id INTO _role_id FROM public.roles rr
       WHERE rr.organization_id IS NULL
         AND rr.key = public._system_role_for_workspace_role(_workspace_role);
    END IF;

    INSERT INTO public.organization_members(organization_id, user_id, role)
    VALUES (_org_id, _uid, 'guest'::public.org_role) ON CONFLICT DO NOTHING;
    IF _role_id IS NOT NULL THEN
      INSERT INTO public.user_role_assignments(user_id, role_id, organization_id, workspace_id)
      VALUES (_uid, _role_id, _org_id, _rule.workspace_id) ON CONFLICT DO NOTHING;
    END IF;
    INSERT INTO public.workspace_members(workspace_id, user_id, role, status)
    VALUES (_rule.workspace_id, _uid, _workspace_role, 'active') ON CONFLICT DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.audit_logs(workspace_id, actor_id, action, resource_type, resource_id, changes)
      VALUES (_rule.workspace_id, _uid, 'auto_invite_applied', 'workspace_member', _uid::text,
        jsonb_build_object('domain', _domain, 'role', _workspace_role, 'permission_role_id', _role_id));
      workspace_id := _rule.workspace_id;
      role := _workspace_role;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_my_auto_invite_rules() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.apply_my_auto_invite_rules() TO authenticated;
