-- Invitation acceptance updates workspace_invitations.status. Its audit trigger
-- previously passed a text variable to audit_logs.action (audit_action), so
-- PostgreSQL rejected the update and rolled back the entire acceptance RPC.
CREATE OR REPLACE FUNCTION public.tg_workspace_invitations_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _action public.audit_action;
  _changes jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      NEW.workspace_id,
      COALESCE(_actor, NEW.invited_by),
      'invitation_sent'::public.audit_action,
      'workspace_invitation',
      NEW.id::text,
      jsonb_build_object(
        'email', NEW.email, 'role', NEW.role, 'invited_by', NEW.invited_by,
        'expires_at', NEW.expires_at, 'status', NEW.status, 'at', now()
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      _action := CASE NEW.status
        WHEN 'accepted'::public.workspace_invite_status THEN 'invitation_accepted'::public.audit_action
        WHEN 'revoked'::public.workspace_invite_status THEN 'invitation_revoked'::public.audit_action
        WHEN 'expired'::public.workspace_invite_status THEN 'invitation_expired'::public.audit_action
        WHEN 'pending'::public.workspace_invite_status THEN 'invitation_resent'::public.audit_action
      END;
      _changes := jsonb_build_object(
        'email', NEW.email, 'role', NEW.role, 'from_status', OLD.status, 'to_status', NEW.status,
        'invited_by', NEW.invited_by, 'accepted_by', NEW.accepted_by,
        'accepted_at', NEW.accepted_at, 'expires_at', NEW.expires_at, 'at', now()
      );
      INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
      VALUES (
        NEW.workspace_id,
        COALESCE(_actor, NEW.accepted_by, NEW.invited_by),
        _action, 'workspace_invitation', NEW.id::text, _changes
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      (SELECT w.id FROM public.workspaces w WHERE w.id = OLD.workspace_id),
      _actor, 'invitation_deleted'::public.audit_action, 'workspace_invitation', OLD.id::text,
      jsonb_build_object('email', OLD.email, 'role', OLD.role, 'status', OLD.status, 'at', now())
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
