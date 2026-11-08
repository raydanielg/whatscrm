CREATE OR REPLACE FUNCTION public.tg_organizations_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    INSERT INTO public.audit_logs (organization_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (NEW.id, auth.uid(), 'update', 'organization', NEW.id::text, _changes);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (organization_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (NULL, auth.uid(), 'delete', 'organization', OLD.id::text,
            jsonb_build_object('deleted', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_workspaces_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    VALUES (NEW.organization_id, NEW.id, auth.uid(), 'update', 'workspace', NEW.id::text, _changes);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (organization_id, workspace_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (NULL, NULL, auth.uid(), 'delete', 'workspace', OLD.id::text,
            jsonb_build_object('deleted', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;
