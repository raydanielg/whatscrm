
-- ============ enums ============
DO $$ BEGIN CREATE TYPE public.agent_presence AS ENUM ('online','away','busy','offline'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.handoff_priority AS ENUM ('low','normal','high','urgent'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.handoff_event_kind AS ENUM (
  'transfer_agent','transfer_department','takeover','resume_ai',
  'queue_enter','queue_leave','queue_assigned','fallback_assigned','offline_bounced'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ departments ============
CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#A4161A',
  fallback_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members manage departments" ON public.departments
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ department_members ============
CREATE TABLE IF NOT EXISTS public.department_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_members TO authenticated;
GRANT ALL ON public.department_members TO service_role;
ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members manage department members" ON public.department_members
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ agent_availability ============
CREATE TABLE IF NOT EXISTS public.agent_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  presence public.agent_presence NOT NULL DEFAULT 'offline',
  status_message TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  max_concurrent INT NOT NULL DEFAULT 5,
  current_load INT NOT NULL DEFAULT 0,
  auto_away_minutes INT NOT NULL DEFAULT 10,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_availability TO authenticated;
GRANT ALL ON public.agent_availability TO service_role;
ALTER TABLE public.agent_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members view availability" ON public.agent_availability
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "users manage own availability" ON public.agent_availability
  FOR ALL TO authenticated
  USING (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));

-- ============ business_hours ============
CREATE TABLE IF NOT EXISTS public.business_hours (
  workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  -- weekly schedule stored as jsonb: { "mon":{"open":"09:00","close":"17:00","enabled":true}, ... }
  weekly_schedule JSONB NOT NULL DEFAULT jsonb_build_object(
    'mon', jsonb_build_object('open','09:00','close','17:00','enabled',true),
    'tue', jsonb_build_object('open','09:00','close','17:00','enabled',true),
    'wed', jsonb_build_object('open','09:00','close','17:00','enabled',true),
    'thu', jsonb_build_object('open','09:00','close','17:00','enabled',true),
    'fri', jsonb_build_object('open','09:00','close','17:00','enabled',true),
    'sat', jsonb_build_object('open','09:00','close','17:00','enabled',false),
    'sun', jsonb_build_object('open','09:00','close','17:00','enabled',false)
  ),
  holidays JSONB NOT NULL DEFAULT '[]'::jsonb,
  offline_message TEXT NOT NULL DEFAULT 'We''re currently offline. Leave a message and we''ll get back to you soon.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_hours TO authenticated;
GRANT ALL ON public.business_hours TO service_role;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members manage business hours" ON public.business_hours
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ handoff_queue ============
CREATE TABLE IF NOT EXISTS public.handoff_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  target_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  target_user_id UUID,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  priority public.handoff_priority NOT NULL DEFAULT 'normal',
  required_skills TEXT[] NOT NULL DEFAULT '{}',
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'waiting', -- waiting|assigned|cancelled|expired
  assigned_to UUID,
  assigned_at TIMESTAMPTZ,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (conversation_id, status)
);
CREATE INDEX IF NOT EXISTS idx_handoff_queue_workspace_status
  ON public.handoff_queue(workspace_id, status, priority DESC, entered_at ASC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handoff_queue TO authenticated;
GRANT ALL ON public.handoff_queue TO service_role;
ALTER TABLE public.handoff_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members manage handoff queue" ON public.handoff_queue
  FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ handoff_events (audit log) ============
CREATE TABLE IF NOT EXISTS public.handoff_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  kind public.handoff_event_kind NOT NULL,
  from_user_id UUID,
  to_user_id UUID,
  from_department_id UUID,
  to_department_id UUID,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_handoff_events_conv ON public.handoff_events(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_handoff_events_workspace ON public.handoff_events(workspace_id, created_at DESC);
GRANT SELECT, INSERT ON public.handoff_events TO authenticated;
GRANT ALL ON public.handoff_events TO service_role;
ALTER TABLE public.handoff_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members read handoff events" ON public.handoff_events
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "workspace members insert handoff events" ON public.handoff_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ conversation.ai_enabled + ownership metadata ============
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handoff_state TEXT NOT NULL DEFAULT 'ai'; -- ai|human|queued

-- ============ updated_at trigger ============
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_departments_updated_at ON public.departments;
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
DROP TRIGGER IF EXISTS trg_agent_availability_updated_at ON public.agent_availability;
CREATE TRIGGER trg_agent_availability_updated_at BEFORE UPDATE ON public.agent_availability
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
DROP TRIGGER IF EXISTS trg_business_hours_updated_at ON public.business_hours;
CREATE TRIGGER trg_business_hours_updated_at BEFORE UPDATE ON public.business_hours
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ============ realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_availability;
ALTER PUBLICATION supabase_realtime ADD TABLE public.handoff_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.handoff_events;
