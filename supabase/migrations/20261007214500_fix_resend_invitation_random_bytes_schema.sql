-- pgcrypto lives in the extensions schema on this project. The resend RPC has
-- search_path=public, so an unqualified gen_random_bytes() fails before its
-- permission check or invitation update can run.
CREATE OR REPLACE FUNCTION public.resend_workspace_invitation(_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wid uuid;
  _new_token text := encode(extensions.gen_random_bytes(24), 'hex');
BEGIN
  SELECT workspace_id INTO _wid FROM public.workspace_invitations WHERE id = _id;
  IF _wid IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF NOT public.has_workspace_role(_wid, auth.uid(), ARRAY['owner'::public.workspace_role,'admin'::public.workspace_role]) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.workspace_invitations
    SET token = _new_token,
        status = 'pending',
        expires_at = now() + interval '14 days',
        accepted_at = NULL, accepted_by = NULL,
        updated_at = now()
    WHERE id = _id;
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (_wid, auth.uid(), 'invite', 'workspace_invitation', _id::text,
    jsonb_build_object('event','invitation_resent'));
  RETURN _new_token;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid) TO authenticated;
