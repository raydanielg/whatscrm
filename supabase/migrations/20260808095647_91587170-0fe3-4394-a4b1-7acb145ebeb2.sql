CREATE OR REPLACE FUNCTION public.ensure_personal_organization(_user_id uuid, _email text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_workspace_id uuid;
  v_plan_id uuid;
  v_base_slug text;
  v_slug text;
  v_name text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ensure_personal_org:' || _user_id::text, 0));

  SELECT organization_id INTO v_org_id
  FROM public.organization_members
  WHERE user_id = _user_id
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_org_id IS NULL THEN
    v_base_slug := COALESCE(
      NULLIF(regexp_replace(lower(split_part(COALESCE(_email, ''), '@', 1)), '[^a-z0-9]+', '-', 'g'), ''),
      'user-' || substr(_user_id::text, 1, 8)
    );
    v_base_slug := regexp_replace(v_base_slug, '(^-|-$)', '', 'g');
    IF v_base_slug = '' THEN
      v_base_slug := 'user-' || substr(_user_id::text, 1, 8);
    END IF;
    v_slug := v_base_slug || '-' || substr(_user_id::text, 1, 6);
    v_name := CASE
      WHEN _email IS NOT NULL AND _email <> '' THEN split_part(_email, '@', 1) || '''s Workspace'
      ELSE 'My Workspace'
    END;

    INSERT INTO public.organizations (name, slug, owner_id, billing_email)
    VALUES (v_name, v_slug, _user_id, _email)
    RETURNING id INTO v_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (v_org_id, _user_id, 'owner')
    ON CONFLICT DO NOTHING;
  ELSE
    SELECT name INTO v_name FROM public.organizations WHERE id = v_org_id;
    v_name := COALESCE(v_name, 'My Workspace');
  END IF;

  SELECT id INTO v_workspace_id
  FROM public.workspaces
  WHERE organization_id = v_org_id AND owner_id = _user_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug) || '-' || substr(v_org_id::text, 1, 6);
    INSERT INTO public.workspaces (name, slug, owner_id, organization_id, plan)
    VALUES (v_name, v_slug, _user_id, v_org_id, 'free')
    RETURNING id INTO v_workspace_id;
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role, status)
  VALUES (v_workspace_id, _user_id, 'owner', 'active')
  ON CONFLICT DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE organization_id = v_org_id) THEN
    SELECT id INTO v_plan_id FROM public.plans WHERE code = 'free' AND is_active = true LIMIT 1;
    IF v_plan_id IS NOT NULL THEN
      INSERT INTO public.subscriptions (
        organization_id, plan_id, status, seats,
        current_period_start, current_period_end, metadata
      ) VALUES (
        v_org_id, v_plan_id, 'active', 1,
        now(), now() + interval '100 years', jsonb_build_object('provisioned', true)
      ) ON CONFLICT (organization_id) DO NOTHING;
    END IF;
  END IF;

  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_personal_organization(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_personal_organization(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_platform_user_deletion(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_successor uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  FOR r IN SELECT id FROM public.organizations WHERE owner_id = _user_id LOOP
    SELECT om.user_id INTO v_successor
    FROM public.organization_members om
    WHERE om.organization_id = r.id AND om.user_id <> _user_id
    ORDER BY CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, om.joined_at
    LIMIT 1;

    IF v_successor IS NULL THEN
      DELETE FROM public.organizations WHERE id = r.id;
    ELSE
      UPDATE public.organizations SET owner_id = v_successor WHERE id = r.id;
      UPDATE public.organization_members
      SET role = 'owner'
      WHERE organization_id = r.id AND user_id = v_successor;
    END IF;
  END LOOP;

  FOR r IN SELECT id FROM public.workspaces WHERE owner_id = _user_id LOOP
    SELECT wm.user_id INTO v_successor
    FROM public.workspace_members wm
    WHERE wm.workspace_id = r.id AND wm.user_id <> _user_id AND wm.status = 'active'
    ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, wm.joined_at
    LIMIT 1;

    IF v_successor IS NULL THEN
      DELETE FROM public.workspaces WHERE id = r.id;
    ELSE
      UPDATE public.workspaces SET owner_id = v_successor WHERE id = r.id;
      UPDATE public.workspace_members
      SET role = 'owner'
      WHERE workspace_id = r.id AND user_id = v_successor;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_platform_user_deletion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_platform_user_deletion(uuid) TO service_role;