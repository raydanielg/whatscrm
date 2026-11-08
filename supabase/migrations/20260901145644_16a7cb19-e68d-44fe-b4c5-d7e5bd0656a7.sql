DROP POLICY IF EXISTS "Members view workspace QR sessions" ON public.whatsapp_qr_sessions;
DROP POLICY IF EXISTS "Members update workspace QR sessions" ON public.whatsapp_qr_sessions;
DROP POLICY IF EXISTS "Members create workspace QR sessions" ON public.whatsapp_qr_sessions;

CREATE POLICY "Admins view workspace QR sessions"
ON public.whatsapp_qr_sessions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members wm
  WHERE wm.workspace_id = whatsapp_qr_sessions.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])));

CREATE POLICY "Admins update workspace QR sessions"
ON public.whatsapp_qr_sessions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.workspace_members wm
  WHERE wm.workspace_id = whatsapp_qr_sessions.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])));

CREATE POLICY "Admins create workspace QR sessions"
ON public.whatsapp_qr_sessions FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.workspace_members wm
  WHERE wm.workspace_id = whatsapp_qr_sessions.workspace_id
    AND wm.user_id = auth.uid()
    AND wm.role = ANY (ARRAY['owner'::workspace_role,'admin'::workspace_role])));