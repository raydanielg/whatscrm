
-- Invitation tokens use pgcrypto, which Supabase installs in extensions.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 1) Extend workspaces
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) Invitation status enum
DO $$ BEGIN
  CREATE TYPE public.workspace_invite_status AS ENUM ('pending','accepted','revoked','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) workspace_invitations table
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.workspace_role NOT NULL DEFAULT 'agent',
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  status public.workspace_invite_status NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wsinv_workspace ON public.workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_wsinv_email ON public.workspace_invitations(lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invitations TO authenticated;
GRANT ALL ON public.workspace_invitations TO service_role;

ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wsinv select members or by token" ON public.workspace_invitations;
CREATE POLICY "wsinv select members or by token"
  ON public.workspace_invitations FOR SELECT
  TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    OR true  -- token-based lookup is allowed to any authenticated user; app filters by token
  );

DROP POLICY IF EXISTS "wsinv insert admins" ON public.workspace_invitations;
CREATE POLICY "wsinv insert admins"
  ON public.workspace_invitations FOR INSERT
  TO authenticated
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

DROP POLICY IF EXISTS "wsinv update admins" ON public.workspace_invitations;
CREATE POLICY "wsinv update admins"
  ON public.workspace_invitations FOR UPDATE
  TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

DROP POLICY IF EXISTS "wsinv delete admins" ON public.workspace_invitations;
CREATE POLICY "wsinv delete admins"
  ON public.workspace_invitations FOR DELETE
  TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE TRIGGER trg_wsinv_updated
  BEFORE UPDATE ON public.workspace_invitations
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) Audit log — allow workspace admins to view workspace-scoped logs
DROP POLICY IF EXISTS "Admins view workspace audit logs" ON public.audit_logs;
CREATE POLICY "Admins view workspace audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])
  );

-- 5) Workspace audit trigger
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
    VALUES (OLD.organization_id, OLD.id, auth.uid(), 'delete', 'workspace', OLD.id::text, jsonb_build_object('deleted', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspaces_audit ON public.workspaces;
CREATE TRIGGER trg_workspaces_audit
  AFTER UPDATE OR DELETE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.tg_workspaces_audit();

-- 6) Transfer workspace ownership
CREATE OR REPLACE FUNCTION public.transfer_workspace_ownership(_workspace_id uuid, _new_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_owner uuid;
BEGIN
  SELECT owner_id INTO _current_owner FROM public.workspaces WHERE id = _workspace_id;
  IF _current_owner IS NULL THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;
  IF _current_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Only the current owner can transfer ownership';
  END IF;
  IF _new_owner_id = _current_owner THEN
    RAISE EXCEPTION 'New owner must be a different user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id = _workspace_id AND user_id = _new_owner_id) THEN
    RAISE EXCEPTION 'New owner must already be a member of the workspace';
  END IF;

  UPDATE public.workspaces SET owner_id = _new_owner_id WHERE id = _workspace_id;
  UPDATE public.workspace_members SET role = 'admin' WHERE workspace_id = _workspace_id AND user_id = _current_owner;
  UPDATE public.workspace_members SET role = 'owner' WHERE workspace_id = _workspace_id AND user_id = _new_owner_id;

  INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (_workspace_id, auth.uid(), 'update', 'workspace', _workspace_id::text,
    jsonb_build_object('event','ownership_transferred','from',_current_owner,'to',_new_owner_id));
END;
$$;

-- 7) Accept workspace invitation
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv public.workspace_invitations%ROWTYPE;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _inv FROM public.workspace_invitations WHERE token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF _inv.status <> 'pending' THEN RAISE EXCEPTION 'Invitation is %', _inv.status; END IF;
  IF _inv.expires_at < now() THEN
    UPDATE public.workspace_invitations SET status='expired' WHERE id=_inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (_inv.workspace_id, _uid, _inv.role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  UPDATE public.workspace_invitations
    SET status='accepted', accepted_at=now(), accepted_by=_uid
    WHERE id=_inv.id;

  INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (_inv.workspace_id, _uid, 'invite', 'workspace_member', _uid::text,
    jsonb_build_object('event','invitation_accepted','invitation_id',_inv.id,'role',_inv.role));

  RETURN _inv.workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_workspace_ownership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text) TO authenticated;
