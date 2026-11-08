-- Restrict credential-bearing channel account rows to workspace owners/admins.
DROP POLICY IF EXISTS "Members read sms accounts" ON public.sms_accounts;
DROP POLICY IF EXISTS "Workspace members read sms accounts" ON public.sms_accounts;
CREATE POLICY "Workspace admins read sms accounts"
ON public.sms_accounts FOR SELECT TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

DROP POLICY IF EXISTS "Workspace admins manage sms accounts" ON public.sms_accounts;
CREATE POLICY "Workspace admins manage sms accounts"
ON public.sms_accounts FOR ALL TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

DROP POLICY IF EXISTS "telegram_accounts: workspace members read" ON public.telegram_accounts;
CREATE POLICY "telegram_accounts: admins read"
ON public.telegram_accounts FOR SELECT TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));

-- Secrets stay out of the API surface entirely for non-service roles.
REVOKE SELECT ON public.sms_accounts FROM authenticated;
GRANT SELECT (id, workspace_id, provider, display_name, phone_number, phone_digits,
              account_sid, status, status_reason, metadata, connected_at, connected_by,
              last_verified_at, created_at, updated_at)
ON public.sms_accounts TO authenticated;
GRANT ALL ON public.sms_accounts TO service_role;

REVOKE SELECT ON public.telegram_accounts FROM authenticated;
GRANT SELECT (id, workspace_id, bot_id, bot_username, bot_name, status, status_reason,
  connected_by, connected_at, last_verified_at, metadata, created_at, updated_at)
ON public.telegram_accounts TO authenticated;
GRANT ALL ON public.telegram_accounts TO service_role;