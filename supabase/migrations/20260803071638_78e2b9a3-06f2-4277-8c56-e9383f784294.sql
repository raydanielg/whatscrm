-- WhatsApp / channel accounts: safe columns only for SELECT
GRANT SELECT (
  id, workspace_id, inbox_id, provider, display_name, phone_number, phone_number_id,
  waba_id, business_id, external_account_id, webhook_signature_algo, status, status_reason,
  metadata, is_default, last_verified_at, created_by, created_at, updated_at
) ON public.channel_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.channel_accounts TO authenticated;
GRANT ALL ON public.channel_accounts TO service_role;

-- SMS accounts
GRANT SELECT (
  id, workspace_id, provider, display_name, phone_number, phone_digits, account_sid,
  status, status_reason, metadata, connected_at, connected_by, last_verified_at,
  created_at, updated_at
) ON public.sms_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sms_accounts TO authenticated;
GRANT ALL ON public.sms_accounts TO service_role;

-- Telegram accounts
GRANT SELECT (
  id, workspace_id, bot_id, bot_username, bot_name, status, status_reason,
  connected_by, connected_at, last_verified_at, metadata, created_at, updated_at
) ON public.telegram_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.telegram_accounts TO authenticated;
GRANT ALL ON public.telegram_accounts TO service_role;