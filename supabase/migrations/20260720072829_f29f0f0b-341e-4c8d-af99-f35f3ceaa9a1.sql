
CREATE OR REPLACE FUNCTION public.tg_crm_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    _ws := (to_jsonb(OLD)->>'workspace_id')::uuid;
    _org := (to_jsonb(OLD)->>'organization_id')::uuid;
    _action := 'delete'::audit_action;
    _changes := jsonb_build_object('deleted', to_jsonb(OLD));
  END IF;
  INSERT INTO public.audit_logs (organization_id, workspace_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (_org, _ws, auth.uid(), _action, _resource, COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'id'), ''), _changes);
  RETURN COALESCE(NEW, OLD);
END; $function$;
