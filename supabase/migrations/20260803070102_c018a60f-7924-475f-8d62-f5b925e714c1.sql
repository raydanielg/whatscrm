-- =========================================================
-- 1. channel_accounts — hide secrets from non-admin members
-- =========================================================
REVOKE SELECT ON public.channel_accounts FROM authenticated;
REVOKE SELECT ON public.channel_accounts FROM anon;

GRANT SELECT (
  id, workspace_id, inbox_id, provider, display_name, phone_number,
  phone_number_id, waba_id, business_id, external_account_id,
  webhook_signature_algo, status, status_reason, metadata, is_default,
  last_verified_at, created_by, created_at, updated_at
) ON public.channel_accounts TO authenticated;

-- Admin-only accessor for the sensitive columns.
CREATE OR REPLACE FUNCTION public.channel_account_secrets(_workspace_id uuid, _account_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, verify_token text, access_token_secret_name text, app_secret_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.id, a.verify_token, a.access_token_secret_name, a.app_secret_name
  FROM public.channel_accounts a
  WHERE a.workspace_id = _workspace_id
    AND (_account_id IS NULL OR a.id = _account_id)
    AND public.has_workspace_role(_workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]);
$$;

REVOKE ALL ON FUNCTION public.channel_account_secrets(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_account_secrets(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.channel_account_secrets(uuid, uuid) TO service_role;

-- =========================================================
-- 2. sms_accounts — hide webhook secret / auth token
-- =========================================================
REVOKE SELECT ON public.sms_accounts FROM authenticated;
REVOKE SELECT ON public.sms_accounts FROM anon;

GRANT SELECT (
  id, workspace_id, provider, display_name, phone_number, phone_digits,
  account_sid, status, status_reason, metadata, connected_at, connected_by,
  last_verified_at, created_at, updated_at
) ON public.sms_accounts TO authenticated;

-- =========================================================
-- 3. telegram_accounts — hide secrets, admin-only management
-- =========================================================
REVOKE SELECT ON public.telegram_accounts FROM authenticated;
REVOKE SELECT ON public.telegram_accounts FROM anon;

GRANT SELECT (
  id, workspace_id, bot_id, bot_username, bot_name, status, status_reason,
  connected_by, connected_at, last_verified_at, metadata, created_at, updated_at
) ON public.telegram_accounts TO authenticated;

DROP POLICY IF EXISTS "telegram_accounts by workspace member" ON public.telegram_accounts;

CREATE POLICY "telegram_accounts: workspace members read"
ON public.telegram_accounts
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "telegram_accounts: admins manage"
ON public.telegram_accounts
FOR ALL
TO authenticated
USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]))
WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::workspace_role[]));