
-- Enums
DO $$ BEGIN
  CREATE TYPE public.calendar_entry_scope AS ENUM ('personal','team','organization');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.calendar_entry_kind AS ENUM (
    'working_hours','break','vacation','holiday','blocked','custom',
    'recurring_available','recurring_unavailable'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.calendar_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  scope public.calendar_entry_scope NOT NULL DEFAULT 'personal',
  owner_id uuid,
  team_id uuid,
  kind public.calendar_entry_kind NOT NULL,
  title text NOT NULL,
  description text,
  color text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  rrule text,
  is_blocking boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_entries_time_check CHECK (end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_entries_workspace ON public.calendar_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_owner ON public.calendar_entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_range ON public.calendar_entries(workspace_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_kind ON public.calendar_entries(workspace_id, kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_entries TO authenticated;
GRANT ALL ON public.calendar_entries TO service_role;

ALTER TABLE public.calendar_entries ENABLE ROW LEVEL SECURITY;

-- Helper: membership check
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_workspace_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
      AND role::text IN ('owner','admin')
  );
$$;

CREATE POLICY "Members can view calendar entries"
  ON public.calendar_entries FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Owners manage personal entries"
  ON public.calendar_entries FOR ALL TO authenticated
  USING (
    scope = 'personal' AND owner_id = auth.uid()
    AND public.is_workspace_member(workspace_id, auth.uid())
  )
  WITH CHECK (
    scope = 'personal' AND owner_id = auth.uid()
    AND public.is_workspace_member(workspace_id, auth.uid())
  );

CREATE POLICY "Admins manage all entries"
  ON public.calendar_entries FOR ALL TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.calendar_entries_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_calendar_entries_updated_at ON public.calendar_entries;
CREATE TRIGGER trg_calendar_entries_updated_at
  BEFORE UPDATE ON public.calendar_entries
  FOR EACH ROW EXECUTE FUNCTION public.calendar_entries_touch_updated_at();

-- Enable realtime
ALTER TABLE public.calendar_entries REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.calendar_entries;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
