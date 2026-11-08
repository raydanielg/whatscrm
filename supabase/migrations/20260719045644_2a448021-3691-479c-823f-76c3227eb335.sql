
ALTER TABLE public.calendar_accounts
  ADD COLUMN IF NOT EXISTS connection_key_ciphertext text,
  ADD COLUMN IF NOT EXISTS ics_url text,
  ADD COLUMN IF NOT EXISTS scopes text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'disconnected',
  ADD COLUMN IF NOT EXISTS last_sync_error text;

CREATE TABLE IF NOT EXISTS public.calendar_busy_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.calendar_accounts(id) ON DELETE CASCADE,
  host_id uuid NOT NULL,
  external_id text,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  title text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_busy_time_check CHECK (end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_busy_ws ON public.calendar_busy_cache(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_busy_host_range ON public.calendar_busy_cache(host_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_calendar_busy_account ON public.calendar_busy_cache(account_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_busy_cache TO authenticated;
GRANT ALL ON public.calendar_busy_cache TO service_role;

ALTER TABLE public.calendar_busy_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_busy_ws_read"
  ON public.calendar_busy_cache FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "calendar_busy_ws_write"
  ON public.calendar_busy_cache FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.calendar_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  account_id uuid REFERENCES public.calendar_accounts(id) ON DELETE CASCADE,
  direction text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL,
  message text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_ws ON public.calendar_sync_log(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_account ON public.calendar_sync_log(account_id, created_at DESC);

GRANT SELECT, INSERT ON public.calendar_sync_log TO authenticated;
GRANT ALL ON public.calendar_sync_log TO service_role;

ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_sync_log_ws_read"
  ON public.calendar_sync_log FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "calendar_sync_log_ws_write"
  ON public.calendar_sync_log FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

ALTER TABLE public.booking_appointments
  ADD COLUMN IF NOT EXISTS external_calendar_events jsonb NOT NULL DEFAULT '{}'::jsonb;
