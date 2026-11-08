
CREATE TABLE public.sales_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('call','meeting','task','email','whatsapp','note','demo','follow_up')),
  title text NOT NULL,
  description text,
  location text,
  meeting_url text,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean NOT NULL DEFAULT false,
  duration_minutes integer,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','completed','cancelled','no_show','overdue')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  outcome text,
  notes text,
  entity_type text CHECK (entity_type IN ('contact','company','lead','deal','customer') OR entity_type IS NULL),
  entity_id uuid,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  participants uuid[] NOT NULL DEFAULT '{}',
  reminder_at timestamptz,
  reminder_sent boolean NOT NULL DEFAULT false,
  recurrence jsonb,
  parent_activity_id uuid REFERENCES public.sales_activities(id) ON DELETE CASCADE,
  external_provider text CHECK (external_provider IN ('google','outlook','ical','apple') OR external_provider IS NULL),
  external_calendar_id text,
  external_event_id text,
  external_synced_at timestamptz,
  tags text[] NOT NULL DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}',
  completed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sales_activities_ws_start ON public.sales_activities(workspace_id, start_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_activities_assignee ON public.sales_activities(assigned_to, start_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_activities_entity ON public.sales_activities(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_activities_type_status ON public.sales_activities(workspace_id, type, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_sales_activities_reminder ON public.sales_activities(reminder_at) WHERE reminder_sent = false AND deleted_at IS NULL;
CREATE INDEX idx_sales_activities_parent ON public.sales_activities(parent_activity_id) WHERE parent_activity_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_activities TO authenticated;
GRANT ALL ON public.sales_activities TO service_role;

ALTER TABLE public.sales_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view activities"
  ON public.sales_activities FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace members create activities"
  ON public.sales_activities FOR INSERT TO authenticated
  WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Owners/assignees/admins update activities"
  ON public.sales_activities FOR UPDATE TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      owner_id = auth.uid() OR assigned_to = auth.uid() OR created_by = auth.uid()
      OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
    )
  );

CREATE POLICY "Owners/admins delete activities"
  ON public.sales_activities FOR DELETE TO authenticated
  USING (
    public.is_workspace_member(workspace_id, auth.uid())
    AND (
      owner_id = auth.uid() OR created_by = auth.uid()
      OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[])
    )
  );

CREATE TRIGGER update_sales_activities_updated_at
  BEFORE UPDATE ON public.sales_activities
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_activities;

CREATE TABLE public.calendar_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google','outlook','ical','apple')),
  account_email text NOT NULL,
  display_name text,
  calendar_id text,
  sync_direction text NOT NULL DEFAULT 'both' CHECK (sync_direction IN ('none','pull','push','both')),
  sync_token text,
  last_synced_at timestamptz,
  is_primary boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  color text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, account_email)
);

CREATE INDEX idx_calendar_accounts_ws ON public.calendar_accounts(workspace_id);
CREATE INDEX idx_calendar_accounts_user ON public.calendar_accounts(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_accounts TO authenticated;
GRANT ALL ON public.calendar_accounts TO service_role;

ALTER TABLE public.calendar_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view calendar accounts"
  ON public.calendar_accounts FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Users manage their own calendar accounts"
  ON public.calendar_accounts FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER update_calendar_accounts_updated_at
  BEFORE UPDATE ON public.calendar_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
