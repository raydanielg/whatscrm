
-- Enums
DO $$ BEGIN
  CREATE TYPE public.backup_scope AS ENUM ('database','storage','media','config','full');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.backup_type AS ENUM ('full','incremental');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.backup_status AS ENUM ('queued','running','completed','failed','verifying','verified','restoring','restored','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.backup_destination AS ENUM ('lovable_cloud','s3','gcs','azure_blob','r2','wasabi','backblaze','local');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- backup_jobs
CREATE TABLE IF NOT EXISTS public.backup_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  schedule_id UUID,
  parent_backup_id UUID REFERENCES public.backup_jobs(id) ON DELETE SET NULL,
  scope public.backup_scope NOT NULL DEFAULT 'full',
  backup_type public.backup_type NOT NULL DEFAULT 'full',
  status public.backup_status NOT NULL DEFAULT 'queued',
  trigger TEXT NOT NULL DEFAULT 'manual', -- manual | scheduled | api
  destination public.backup_destination NOT NULL DEFAULT 'lovable_cloud',
  destination_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_path TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  compressed_size_bytes BIGINT NOT NULL DEFAULT 0,
  is_encrypted BOOLEAN NOT NULL DEFAULT true,
  encryption_algorithm TEXT NOT NULL DEFAULT 'AES-256-GCM',
  encryption_key_id TEXT,
  checksum TEXT,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_at TIMESTAMPTZ,
  verification_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  restore_point_lsn TEXT,
  point_in_time TIMESTAMPTZ,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backup_jobs_workspace_created_idx ON public.backup_jobs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS backup_jobs_status_idx ON public.backup_jobs(status);
CREATE INDEX IF NOT EXISTS backup_jobs_schedule_idx ON public.backup_jobs(schedule_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_jobs TO authenticated;
GRANT ALL ON public.backup_jobs TO service_role;

ALTER TABLE public.backup_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read backups"
  ON public.backup_jobs FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace admins manage backups"
  ON public.backup_jobs FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

CREATE TRIGGER trg_backup_jobs_touch
  BEFORE UPDATE ON public.backup_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- backup_schedules
CREATE TABLE IF NOT EXISTS public.backup_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  scope public.backup_scope NOT NULL DEFAULT 'full',
  backup_type public.backup_type NOT NULL DEFAULT 'full',
  cron_expression TEXT NOT NULL DEFAULT '0 3 * * *',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  retention_days INT NOT NULL DEFAULT 30,
  keep_last_n INT NOT NULL DEFAULT 30,
  destination public.backup_destination NOT NULL DEFAULT 'lovable_cloud',
  destination_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_encrypted BOOLEAN NOT NULL DEFAULT true,
  encryption_key_id TEXT,
  notify_on_success BOOLEAN NOT NULL DEFAULT false,
  notify_on_failure BOOLEAN NOT NULL DEFAULT true,
  notify_emails TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_status public.backup_status,
  next_run_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backup_schedules_ws_idx ON public.backup_schedules(workspace_id);
CREATE INDEX IF NOT EXISTS backup_schedules_next_run_idx ON public.backup_schedules(next_run_at) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_schedules TO authenticated;
GRANT ALL ON public.backup_schedules TO service_role;

ALTER TABLE public.backup_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read schedules"
  ON public.backup_schedules FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace admins manage schedules"
  ON public.backup_schedules FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

CREATE TRIGGER trg_backup_schedules_touch
  BEFORE UPDATE ON public.backup_schedules
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- backup_restore_operations
CREATE TABLE IF NOT EXISTS public.backup_restore_operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  backup_id UUID REFERENCES public.backup_jobs(id) ON DELETE SET NULL,
  restore_mode TEXT NOT NULL DEFAULT 'preview', -- preview | in_place | new_workspace | point_in_time
  point_in_time TIMESTAMPTZ,
  target_workspace_id UUID,
  status public.backup_status NOT NULL DEFAULT 'queued',
  preview_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  affected_tables TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  restored_rows BIGINT NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backup_restore_ws_idx ON public.backup_restore_operations(workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_restore_operations TO authenticated;
GRANT ALL ON public.backup_restore_operations TO service_role;

ALTER TABLE public.backup_restore_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace admins manage restores"
  ON public.backup_restore_operations FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

CREATE TRIGGER trg_backup_restore_touch
  BEFORE UPDATE ON public.backup_restore_operations
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- backup_notifications
CREATE TABLE IF NOT EXISTS public.backup_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL,
  backup_id UUID REFERENCES public.backup_jobs(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.backup_schedules(id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'info', -- info | success | warning | error
  title TEXT NOT NULL,
  body TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backup_notifications_ws_idx ON public.backup_notifications(workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backup_notifications TO authenticated;
GRANT ALL ON public.backup_notifications TO service_role;

ALTER TABLE public.backup_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members read notifications"
  ON public.backup_notifications FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace admins manage notifications"
  ON public.backup_notifications FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));
