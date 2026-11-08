-- Two separate invitation-flow bugs found live:
--
-- 1. resend_workspace_invitation() was never GRANTed EXECUTE to
--    `authenticated` (accept_workspace_invitation was, this one was missed),
--    so every "Regenerate"/"Resend" click failed with
--    "permission denied for function resend_workspace_invitation".
--
-- 2. /invite/$token (useInvitationByToken) selects straight from
--    workspace_invitations as the current client. Its RLS policy
--    ("wsinv select admins or invitee") only allows a workspace admin/owner
--    or a row whose email matches the CALLER'S OWN JWT email — but the
--    person opening an invite link is, by definition, usually not signed in
--    yet, so there is no JWT and the row is invisible. The page always read
--    this as "Invitation not found", even for a freshly-created, unexpired
--    invite. A SECURITY DEFINER lookup (mirroring accept_workspace_invitation)
--    exposes only the handful of fields the page needs, keyed by the
--    unguessable 48-char token itself, which is what proves the caller holds
--    the link.
GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token text)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  email text,
  role public.workspace_role,
  status public.workspace_invite_status,
  expires_at timestamptz,
  workspace_name text,
  workspace_avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id, i.workspace_id, i.email, i.role, i.status, i.expires_at,
    w.name, w.avatar_url
  FROM public.workspace_invitations i
  JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.token = _token;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(text) TO anon, authenticated;
