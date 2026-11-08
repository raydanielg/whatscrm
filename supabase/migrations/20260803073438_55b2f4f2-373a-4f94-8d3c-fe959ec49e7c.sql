CREATE OR REPLACE FUNCTION public.assign_conversation(_conversation_id uuid, _assignee uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ws uuid;
BEGIN
  SELECT workspace_id INTO _ws FROM public.conversations WHERE id = _conversation_id;
  IF _ws IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  -- Verify the caller is a member of the workspace
  IF NOT public.is_workspace_member(_ws, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.conversations
  SET
    assigned_to = _assignee,
    assigned_at = now(),
    updated_at = now(),
    handoff_state = 'human'
  WHERE id = _conversation_id;
END;
$$;
