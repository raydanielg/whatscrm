
-- 1. Extend organizations with profile fields
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS working_days smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  ADD COLUMN IF NOT EXISTS brand_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2. Transfer ownership RPC: only the current owner can call this;
--    the new owner must already be a member of the org.
CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(
  _org_id uuid,
  _new_owner_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_owner uuid;
BEGIN
  SELECT owner_id INTO _current_owner FROM public.organizations WHERE id = _org_id;
  IF _current_owner IS NULL THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;
  IF _current_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only the current owner can transfer ownership';
  END IF;
  IF _new_owner_id = _current_owner THEN
    RAISE EXCEPTION 'New owner must be a different user';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org_id AND user_id = _new_owner_id
  ) THEN
    RAISE EXCEPTION 'New owner must already be a member of the organization';
  END IF;

  UPDATE public.organizations SET owner_id = _new_owner_id WHERE id = _org_id;

  UPDATE public.organization_members
    SET role = 'admin'
    WHERE organization_id = _org_id AND user_id = _current_owner;

  UPDATE public.organization_members
    SET role = 'owner'
    WHERE organization_id = _org_id AND user_id = _new_owner_id;

  INSERT INTO public.audit_logs (organization_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (
    _org_id,
    auth.uid(),
    'update',
    'organization',
    _org_id::text,
    jsonb_build_object('event', 'ownership_transferred', 'from', _current_owner, 'to', _new_owner_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_organization_ownership(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership(uuid, uuid) TO authenticated;

-- 3. Audit trigger: log every UPDATE/DELETE on organizations
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
    _changes := jsonb_build_object(
      'before', to_jsonb(OLD) - 'updated_at',
      'after',  to_jsonb(NEW) - 'updated_at'
    );
    IF to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.audit_logs (organization_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (NEW.id, auth.uid(), 'update', 'organization', NEW.id::text, _changes);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (organization_id, actor_id, action, resource_type, resource_id, changes)
    VALUES (OLD.id, auth.uid(), 'delete', 'organization', OLD.id::text, jsonb_build_object('deleted', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_audit ON public.organizations;
CREATE TRIGGER trg_organizations_audit
AFTER UPDATE OR DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.tg_organizations_audit();
