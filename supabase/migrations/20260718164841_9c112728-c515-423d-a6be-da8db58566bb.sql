
-- Invitation lifecycle audit trigger
CREATE OR REPLACE FUNCTION public.tg_workspace_invitations_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _action text;
  _changes jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      NEW.workspace_id,
      COALESCE(_actor, NEW.invited_by),
      'invitation_sent',
      'workspace_invitation',
      NEW.id::text,
      jsonb_build_object(
        'email', NEW.email,
        'role', NEW.role,
        'invited_by', NEW.invited_by,
        'expires_at', NEW.expires_at,
        'status', NEW.status,
        'at', now()
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      _action := CASE NEW.status::text
        WHEN 'accepted' THEN 'invitation_accepted'
        WHEN 'revoked'  THEN 'invitation_revoked'
        WHEN 'expired'  THEN 'invitation_expired'
        WHEN 'pending'  THEN 'invitation_resent'
        ELSE 'invitation_' || NEW.status::text
      END;
      _changes := jsonb_build_object(
        'email', NEW.email,
        'role', NEW.role,
        'from_status', OLD.status,
        'to_status', NEW.status,
        'invited_by', NEW.invited_by,
        'accepted_by', NEW.accepted_by,
        'accepted_at', NEW.accepted_at,
        'expires_at', NEW.expires_at,
        'at', now()
      );
      INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
      VALUES (
        NEW.workspace_id,
        COALESCE(_actor, NEW.accepted_by, NEW.invited_by),
        _action,
        'workspace_invitation',
        NEW.id::text,
        _changes
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      OLD.workspace_id,
      _actor,
      'invitation_deleted',
      'workspace_invitation',
      OLD.id::text,
      jsonb_build_object('email', OLD.email, 'role', OLD.role, 'status', OLD.status, 'at', now())
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_workspace_invitations_audit_ins ON public.workspace_invitations;
DROP TRIGGER IF EXISTS trg_workspace_invitations_audit_upd ON public.workspace_invitations;
DROP TRIGGER IF EXISTS trg_workspace_invitations_audit_del ON public.workspace_invitations;

CREATE TRIGGER trg_workspace_invitations_audit_ins
  AFTER INSERT ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.tg_workspace_invitations_audit();

CREATE TRIGGER trg_workspace_invitations_audit_upd
  AFTER UPDATE ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.tg_workspace_invitations_audit();

CREATE TRIGGER trg_workspace_invitations_audit_del
  AFTER DELETE ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.tg_workspace_invitations_audit();

-- Sweep function to mark stale pending invites as expired (emits audit via trigger)
CREATE OR REPLACE FUNCTION public.expire_stale_workspace_invitations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.workspace_invitations
     SET status = 'expired', updated_at = now()
   WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

GRANT EXECUTE ON FUNCTION public.expire_stale_workspace_invitations() TO authenticated, service_role;

-- Convenience view for the invitation audit trail (RLS via underlying audit_logs)
CREATE OR REPLACE VIEW public.workspace_invitation_audit AS
SELECT
  al.id,
  al.workspace_id,
  al.actor_id,
  al.action,
  al.resource_id AS invitation_id,
  al.changes,
  al.created_at
FROM public.audit_logs al
WHERE al.resource_type = 'workspace_invitation';

GRANT SELECT ON public.workspace_invitation_audit TO authenticated;
