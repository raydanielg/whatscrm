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
    ORDER BY CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
             wm.created_at
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
