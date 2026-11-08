-- 1) Workspace membership audit trigger --------------------------------------
CREATE OR REPLACE FUNCTION public.tg_workspace_members_audit()
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
    _action := 'member_added';
    _changes := jsonb_build_object(
      'user_id', NEW.user_id,
      'role',    NEW.role,
      'status',  NEW.status
    );
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (NEW.workspace_id, _actor, _action, 'workspace_member', NEW.user_id::text, _changes);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
      VALUES (
        NEW.workspace_id, _actor, 'role_changed', 'workspace_member', NEW.user_id::text,
        jsonb_build_object('user_id', NEW.user_id, 'from', OLD.role, 'to', NEW.role)
      );
    END IF;
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
      VALUES (
        NEW.workspace_id, _actor,
        CASE WHEN NEW.status = 'suspended' THEN 'member_suspended' ELSE 'member_reactivated' END,
        'workspace_member', NEW.user_id::text,
        jsonb_build_object('user_id', NEW.user_id, 'from', OLD.status, 'to', NEW.status)
      );
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      OLD.workspace_id, _actor, 'member_removed', 'workspace_member', OLD.user_id::text,
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_members_audit ON public.workspace_members;
CREATE TRIGGER trg_workspace_members_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.workspace_members
  FOR EACH ROW EXECUTE FUNCTION public.tg_workspace_members_audit();


-- 2) Login-event audit trigger ------------------------------------------------
-- Fans a login_history row out to audit_logs for every workspace the user
-- currently belongs to, so each workspace's admins can see their agents'
-- login activity for compliance without being able to see unrelated users.
CREATE OR REPLACE FUNCTION public.tg_login_history_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ws uuid;
BEGIN
  FOR _ws IN
    SELECT workspace_id FROM public.workspace_members
    WHERE user_id = NEW.user_id AND status = 'active'
  LOOP
    INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (
      _ws,
      NEW.user_id,
      CASE NEW.event
        WHEN 'success' THEN 'login_success'
        WHEN 'failed'  THEN 'login_failed'
        WHEN 'logout'  THEN 'logout'
        ELSE 'login_' || NEW.event
      END,
      'auth_session',
      NEW.id::text,
      jsonb_build_object(
        'event',          NEW.event,
        'ip_address',     NEW.ip_address,
        'user_agent',     NEW.user_agent,
        'device',         NEW.device,
        'failure_reason', NEW.failure_reason
      )
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_login_history_audit ON public.login_history;
CREATE TRIGGER trg_login_history_audit
  AFTER INSERT ON public.login_history
  FOR EACH ROW EXECUTE FUNCTION public.tg_login_history_audit();


-- 3) Admin-action helper ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _workspace_id  uuid,
  _action        text,
  _resource_type text DEFAULT NULL,
  _resource_id   text DEFAULT NULL,
  _data          jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id  uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_workspace_role(_workspace_id, _uid, ARRAY['owner','admin']::workspace_role[]) THEN
    RAISE EXCEPTION 'Only workspace owners and admins can record admin actions';
  END IF;
  IF _action IS NULL OR length(btrim(_action)) = 0 THEN
    RAISE EXCEPTION 'Action label is required';
  END IF;

  INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (_workspace_id, _uid, _action, _resource_type, _resource_id, COALESCE(_data, '{}'::jsonb))
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_admin_action(uuid, text, text, text, jsonb) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.log_admin_action(uuid, text, text, text, jsonb) TO authenticated;


-- 4) Helpful index for the timeline view -------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_ws_created
  ON public.audit_logs (workspace_id, created_at DESC);