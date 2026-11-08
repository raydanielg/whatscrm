
CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(
  _name text,
  _slug text,
  _organization_id uuid DEFAULT NULL,
  _description text DEFAULT NULL
) RETURNS public.workspaces
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ws public.workspaces;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.workspaces (name, slug, owner_id, organization_id, description)
  VALUES (_name, _slug, _uid, _organization_id, _description)
  RETURNING * INTO _ws;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_ws.id, _uid, 'owner');

  RETURN _ws;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_workspace_with_owner(text, text, uuid, text) TO authenticated;
