-- Helper: may the caller manage revocation/rollback for this workspace?
CREATE OR REPLACE FUNCTION public.can_manage_vcard_lifecycle(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_workspace_role(
    _workspace_id,
    _user_id,
    ARRAY['owner','admin','manager']::workspace_role[]
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_vcard_lifecycle(uuid, uuid) TO authenticated;

-- Enforce the role requirement on revoke / restore / version rollback.
CREATE OR REPLACE FUNCTION public.enforce_vcard_lifecycle_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  lifecycle_change boolean;
BEGIN
  -- Service role / background jobs (no auth context) are unaffected.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  lifecycle_change :=
    (NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
    OR (NEW.revoked_by IS DISTINCT FROM OLD.revoked_by)
    OR COALESCE(NULLIF(current_setting('app.vcard_rollback', true), ''), 'off') = 'on';

  IF lifecycle_change AND NOT public.can_manage_vcard_lifecycle(NEW.workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only workspace owners, admins and managers can revoke, reactivate or roll back a digital card'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vcards_enforce_lifecycle_role ON public.vcards;
CREATE TRIGGER trg_vcards_enforce_lifecycle_role
BEFORE UPDATE ON public.vcards
FOR EACH ROW
EXECUTE FUNCTION public.enforce_vcard_lifecycle_role();

-- Allow the client to flag a rollback update so it is both role-checked and
-- recorded as a "restored" action in the audit trail.
CREATE OR REPLACE FUNCTION public.restore_vcard_version(_revision_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  rev public.vcard_revisions%ROWTYPE;
  snap jsonb;
BEGIN
  SELECT * INTO rev FROM public.vcard_revisions WHERE id = _revision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Revision not found';
  END IF;

  IF NOT public.can_manage_vcard_lifecycle(rev.workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only workspace owners, admins and managers can roll a digital card back to an earlier version'
      USING ERRCODE = '42501';
  END IF;

  snap := to_jsonb(rev.snapshot);

  UPDATE public.vcards SET
    slug = COALESCE(snap->>'slug', slug),
    full_name = COALESCE(snap->>'full_name', full_name),
    job_title = snap->>'job_title',
    company = snap->>'company',
    phone = snap->>'phone',
    whatsapp = snap->>'whatsapp',
    email = snap->>'email',
    website = snap->>'website',
    address = snap->>'address',
    bio = snap->>'bio',
    avatar_url = snap->>'avatar_url',
    cover_url = snap->>'cover_url',
    socials = COALESCE(snap->'socials', '{}'::jsonb),
    theme = COALESCE(snap->'theme', '{}'::jsonb),
    is_public = COALESCE((snap->>'is_public')::boolean, is_public),
    contact_id = NULLIF(snap->>'contact_id', '')::uuid
  WHERE id = rev.vcard_id;

  RETURN rev.vcard_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_vcard_version(uuid) TO authenticated;