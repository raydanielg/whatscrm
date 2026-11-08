CREATE OR REPLACE FUNCTION public.tg_crm_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _resource text := TG_ARGV[0];
  _ws uuid; _org uuid; _action audit_action; _changes jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _ws := (to_jsonb(NEW)->>'workspace_id')::uuid;
    _org := (to_jsonb(NEW)->>'organization_id')::uuid;
    _action := 'create'::audit_action;
    _changes := jsonb_build_object('after', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN RETURN NEW; END IF;
    _ws := (to_jsonb(NEW)->>'workspace_id')::uuid;
    _org := (to_jsonb(NEW)->>'organization_id')::uuid;
    _action := 'update'::audit_action;
    _changes := jsonb_build_object('before', to_jsonb(OLD) - 'updated_at', 'after', to_jsonb(NEW) - 'updated_at');
  ELSIF TG_OP = 'DELETE' THEN
    _ws := (SELECT w.id FROM public.workspaces w WHERE w.id = (to_jsonb(OLD)->>'workspace_id')::uuid);
    _org := (SELECT o.id FROM public.organizations o WHERE o.id = (to_jsonb(OLD)->>'organization_id')::uuid);
    _action := 'delete'::audit_action;
    _changes := jsonb_build_object('deleted', to_jsonb(OLD));
  END IF;
  INSERT INTO public.audit_logs (organization_id, workspace_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (_org, _ws, auth.uid(), _action, _resource, COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'id'), ''), _changes);
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.tg_workspace_members_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      NEW.workspace_id, _actor, 'create'::public.audit_action, 'workspace_member', NEW.user_id::text,
      jsonb_build_object('event','member_added','user_id', NEW.user_id, 'role', NEW.role, 'status', NEW.status)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
      VALUES (
        NEW.workspace_id, _actor, 'update'::public.audit_action, 'workspace_member', NEW.user_id::text,
        jsonb_build_object('event','role_changed','user_id', NEW.user_id, 'from', OLD.role, 'to', NEW.role)
      );
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
      VALUES (
        NEW.workspace_id, _actor, 'update'::public.audit_action, 'workspace_member', NEW.user_id::text,
        jsonb_build_object(
          'event', CASE WHEN NEW.status = 'suspended' THEN 'member_suspended' ELSE 'member_reactivated' END,
          'user_id', NEW.user_id, 'from', OLD.status, 'to', NEW.status
        )
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      (SELECT w.id FROM public.workspaces w WHERE w.id = OLD.workspace_id),
      _actor, 'delete'::public.audit_action, 'workspace_member', OLD.user_id::text,
      jsonb_build_object('event','member_removed','user_id', OLD.user_id, 'role', OLD.role)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

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
        'email', NEW.email, 'role', NEW.role, 'invited_by', NEW.invited_by,
        'expires_at', NEW.expires_at, 'status', NEW.status, 'at', now()
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
      _actor, 'invitation_deleted', 'workspace_invitation', OLD.id::text,
      jsonb_build_object('email', OLD.email, 'role', OLD.role, 'status', OLD.status, 'at', now())
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;
