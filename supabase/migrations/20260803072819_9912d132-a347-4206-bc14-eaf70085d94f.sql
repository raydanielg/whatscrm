-- Meeting provider credentials: owner/admin only, ciphertext never readable by clients
REVOKE ALL ON public.meeting_provider_accounts FROM anon;
REVOKE SELECT ON public.meeting_provider_accounts FROM authenticated;
GRANT SELECT (id, workspace_id, provider, display_name, is_default, status, config, last_error, created_by, created_at, updated_at)
  ON public.meeting_provider_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.meeting_provider_accounts TO authenticated;
GRANT ALL ON public.meeting_provider_accounts TO service_role;

-- Chat widgets: stop anonymous enumeration of every tenant's widget config.
-- The public embed is served through the server endpoint (service role), which
-- validates the widget id and allowed domains before returning config.
DROP POLICY IF EXISTS "Public can read active widgets" ON public.chat_widgets;
REVOKE ALL ON public.chat_widgets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_widgets TO authenticated;
GRANT ALL ON public.chat_widgets TO service_role;