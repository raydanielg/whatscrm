
-- 1. Appointment-level meeting metadata
ALTER TABLE public.booking_appointments
  ADD COLUMN IF NOT EXISTS meeting_password text,
  ADD COLUMN IF NOT EXISTS waiting_room_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_url text,
  ADD COLUMN IF NOT EXISTS meeting_notes text,
  ADD COLUMN IF NOT EXISTS meeting_provider_account_id uuid;

-- 2. Provider accounts
CREATE TABLE IF NOT EXISTS public.meeting_provider_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider IN ('zoom','google_meet','microsoft_teams','jitsi','livekit')),
  display_name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','error')),
  credentials_ciphertext text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_provider_accounts_ws_idx ON public.meeting_provider_accounts (workspace_id, provider);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_provider_accounts TO authenticated;
GRANT ALL ON public.meeting_provider_accounts TO service_role;
ALTER TABLE public.meeting_provider_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting accounts: workspace members" ON public.meeting_provider_accounts;
CREATE POLICY "meeting accounts: workspace members"
  ON public.meeting_provider_accounts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = meeting_provider_accounts.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = meeting_provider_accounts.workspace_id AND wm.user_id = auth.uid()));

-- 3. Attendance tracking
CREATE TABLE IF NOT EXISTS public.meeting_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.booking_appointments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  participant_name text,
  participant_email text,
  participant_role text NOT NULL DEFAULT 'guest' CHECK (participant_role IN ('host','co_host','guest')),
  joined_at timestamptz,
  left_at timestamptz,
  duration_seconds integer,
  provider text,
  external_participant_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_attendance_appt_idx ON public.meeting_attendance (appointment_id);
CREATE INDEX IF NOT EXISTS meeting_attendance_ws_idx ON public.meeting_attendance (workspace_id, joined_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_attendance TO authenticated;
GRANT ALL ON public.meeting_attendance TO service_role;
ALTER TABLE public.meeting_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting attendance: workspace members" ON public.meeting_attendance;
CREATE POLICY "meeting attendance: workspace members"
  ON public.meeting_attendance FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = meeting_attendance.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = meeting_attendance.workspace_id AND wm.user_id = auth.uid()));

-- 4. History log
CREATE TABLE IF NOT EXISTS public.meeting_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  appointment_id uuid REFERENCES public.booking_appointments(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_account_id uuid REFERENCES public.meeting_provider_accounts(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created','updated','cancelled','recording_ready','attendance_synced','notes_saved','error')),
  join_url text,
  external_meeting_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_history_ws_idx ON public.meeting_history (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meeting_history_appt_idx ON public.meeting_history (appointment_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_history TO authenticated;
GRANT ALL ON public.meeting_history TO service_role;
ALTER TABLE public.meeting_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meeting history: workspace members" ON public.meeting_history;
CREATE POLICY "meeting history: workspace members"
  ON public.meeting_history FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = meeting_history.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = meeting_history.workspace_id AND wm.user_id = auth.uid()));

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_history;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_attendance;
