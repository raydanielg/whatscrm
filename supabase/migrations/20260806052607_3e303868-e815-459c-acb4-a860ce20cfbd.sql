CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  summary text,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON public.platform_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_resource ON public.platform_audit_logs (resource_type, resource_id, created_at DESC);

GRANT SELECT ON public.platform_audit_logs TO authenticated;
GRANT ALL ON public.platform_audit_logs TO service_role;

ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read platform audit log" ON public.platform_audit_logs;
CREATE POLICY "Super admins read platform audit log"
  ON public.platform_audit_logs FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Credential column hardening: members keep row access, secrets do not.
REVOKE SELECT ON public.telegram_accounts FROM authenticated;
GRANT SELECT (id, workspace_id, bot_id, bot_username, bot_name, status, status_reason,
  connected_by, connected_at, last_verified_at, metadata, created_at, updated_at)
  ON public.telegram_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.telegram_accounts TO authenticated;
GRANT ALL ON public.telegram_accounts TO service_role;

REVOKE SELECT ON public.whatsapp_qr_sessions FROM authenticated;
GRANT SELECT (id, workspace_id, created_by, status, worker_session_id, phone_number,
  display_name, device_platform, error_message, last_seen_at, connected_at, revoked_at,
  created_at, updated_at, expires_at, qr_expires_at, metadata, disconnected_at)
  ON public.whatsapp_qr_sessions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.whatsapp_qr_sessions TO authenticated;
GRANT ALL ON public.whatsapp_qr_sessions TO service_role;