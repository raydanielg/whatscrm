
CREATE OR REPLACE FUNCTION public.tg_workspace_members_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      OLD.workspace_id, _actor, 'delete'::public.audit_action, 'workspace_member', OLD.user_id::text,
      jsonb_build_object('event','member_removed','user_id', OLD.user_id, 'role', OLD.role)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_workspaces_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _changes jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN
      RETURN NEW;
    END IF;
    _changes := jsonb_build_object(
      'before', to_jsonb(OLD) - 'updated_at',
      'after',  to_jsonb(NEW) - 'updated_at'
    );
    INSERT INTO public.audit_logs (organization_id, workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (NEW.organization_id, NEW.id, auth.uid(), 'update'::public.audit_action, 'workspace', NEW.id::text, _changes);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (organization_id, workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (OLD.organization_id, OLD.id, auth.uid(), 'delete'::public.audit_action, 'workspace', OLD.id::text, jsonb_build_object('deleted', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;
