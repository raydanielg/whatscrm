CREATE OR REPLACE FUNCTION public.ensure_personal_organization(_user_id uuid, _email text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_base_slug text;
  v_slug text;
  v_name text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  -- Serialize concurrent provisioning per-user so duplicates cannot be created
  PERFORM pg_advisory_xact_lock(hashtextextended('ensure_personal_org:' || _user_id::text, 0));

  -- Fast path: return the earliest membership if one already exists
  SELECT organization_id INTO v_org_id
  FROM public.organization_members
  WHERE user_id = _user_id
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    RETURN v_org_id;
  END IF;

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

  RETURN v_org_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_personal_organization(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_personal_organization(uuid, text) TO service_role;