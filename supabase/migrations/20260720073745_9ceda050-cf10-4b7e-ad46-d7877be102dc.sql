
CREATE TABLE public.whatsapp_qr_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  worker_session_id text,
  phone_number text,
  display_name text,
  device_platform text,
  error_message text,
  last_seen_at timestamptz,
  connected_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_qr_sessions_workspace ON public.whatsapp_qr_sessions(workspace_id, status);
CREATE INDEX idx_wa_qr_sessions_worker ON public.whatsapp_qr_sessions(worker_session_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_qr_sessions TO authenticated;
GRANT ALL ON public.whatsapp_qr_sessions TO service_role;

ALTER TABLE public.whatsapp_qr_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view workspace QR sessions"
  ON public.whatsapp_qr_sessions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = whatsapp_qr_sessions.workspace_id
      AND wm.user_id = auth.uid()
  ));

CREATE POLICY "Members create workspace QR sessions"
  ON public.whatsapp_qr_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = whatsapp_qr_sessions.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Members update workspace QR sessions"
  ON public.whatsapp_qr_sessions FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = whatsapp_qr_sessions.workspace_id
      AND wm.user_id = auth.uid()
  ));

CREATE POLICY "Admins delete workspace QR sessions"
  ON public.whatsapp_qr_sessions FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = whatsapp_qr_sessions.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
  ));

CREATE TRIGGER whatsapp_qr_sessions_updated_at
  BEFORE UPDATE ON public.whatsapp_qr_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
