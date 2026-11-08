CREATE OR REPLACE FUNCTION public.ensure_personal_organization(_user_id uuid, _email text DEFAULT NULL::text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    -- Adopt the workspace handle_new_user() created at signup (no organization
    -- yet) instead of creating a second one.
    SELECT id INTO v_workspace_id
    FROM public.workspaces
    WHERE organization_id IS NULL AND owner_id = _user_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_workspace_id IS NOT NULL THEN
      UPDATE public.workspaces SET organization_id = v_org_id WHERE id = v_workspace_id;
    ELSE
      v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
      v_slug := trim(both '-' from v_slug) || '-' || substr(v_org_id::text, 1, 6);
      INSERT INTO public.workspaces (name, slug, owner_id, organization_id, plan)
      VALUES (v_name, v_slug, _user_id, v_org_id, 'free')
      RETURNING id INTO v_workspace_id;
    END IF;
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
$function$;
