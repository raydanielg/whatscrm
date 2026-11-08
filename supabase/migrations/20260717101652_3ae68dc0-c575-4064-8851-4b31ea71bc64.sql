
-- 1) Enum
DO $$ BEGIN
  CREATE TYPE public.member_status AS ENUM ('active','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Extend workspace_members
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS status public.member_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ws_members_status ON public.workspace_members(workspace_id, status);

-- 3) Extend profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Backfill email from auth.users where missing
UPDATE public.profiles p
  SET email = u.email
  FROM auth.users u
  WHERE p.id = u.id AND p.email IS NULL;

-- 4) Suspend/reactivate propagate via is_workspace_member/has_workspace_role
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
      AND role = ANY(_roles) AND status = 'active'
  );
$$;

-- 5) Resend invitation
CREATE OR REPLACE FUNCTION public.resend_workspace_invitation(_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _wid uuid;
  _new_token text := encode(extensions.gen_random_bytes(24), 'hex');
BEGIN
  SELECT workspace_id INTO _wid FROM public.workspace_invitations WHERE id = _id;
  IF _wid IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF NOT public.has_workspace_role(_wid, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.workspace_invitations
    SET token = _new_token,
        status = 'pending',
        expires_at = now() + interval '14 days',
        accepted_at = NULL, accepted_by = NULL,
        updated_at = now()
    WHERE id = _id;
  INSERT INTO public.audit_logs (workspace_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (_wid, auth.uid(), 'invite', 'workspace_invitation', _id::text,
    jsonb_build_object('event','invitation_resent'));
  RETURN _new_token;
END; $$;

GRANT EXECUTE ON FUNCTION public.resend_workspace_invitation(uuid) TO authenticated;

-- 6) Heartbeat — keep profile last_seen_at fresh
CREATE OR REPLACE FUNCTION public.heartbeat()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  UPDATE public.profiles SET last_seen_at = now() WHERE id = auth.uid();
  UPDATE public.workspace_members SET last_active_at = now() WHERE user_id = auth.uid();
END; $$;

GRANT EXECUTE ON FUNCTION public.heartbeat() TO authenticated;

-- 7) Realtime publication
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER TABLE public.workspace_members REPLICA IDENTITY FULL;
ALTER TABLE public.workspace_invitations REPLICA IDENTITY FULL;
ALTER TABLE public.audit_logs REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_members;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.workspace_invitations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
