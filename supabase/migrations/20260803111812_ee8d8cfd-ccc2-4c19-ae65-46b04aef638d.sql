-- social_channels: hide the OAuth access_token from client roles via column grants.
REVOKE SELECT, INSERT, UPDATE ON public.social_channels FROM authenticated;
REVOKE ALL ON public.social_channels FROM anon;
GRANT SELECT (id, workspace_id, platform, name, external_id, username, avatar_url, token_expires_at, status, metadata, created_by, created_at, updated_at) ON public.social_channels TO authenticated;
GRANT INSERT (id, workspace_id, platform, name, external_id, username, avatar_url, token_expires_at, status, metadata, created_by, created_at, updated_at) ON public.social_channels TO authenticated;
GRANT UPDATE (name, external_id, username, avatar_url, token_expires_at, status, metadata, updated_at) ON public.social_channels TO authenticated;
GRANT DELETE ON public.social_channels TO authenticated;
GRANT ALL ON public.social_channels TO service_role;

-- chatbot_webhooks: hide the HMAC signing secret from client roles.
REVOKE SELECT, INSERT, UPDATE ON public.chatbot_webhooks FROM authenticated;
REVOKE ALL ON public.chatbot_webhooks FROM anon;
GRANT SELECT (id, workspace_id, name, url, events, active, created_by, last_delivered_at, last_error, failure_count, created_at, updated_at) ON public.chatbot_webhooks TO authenticated;
GRANT INSERT (id, workspace_id, name, url, events, active, created_by, created_at, updated_at) ON public.chatbot_webhooks TO authenticated;
GRANT UPDATE (name, url, events, active, last_delivered_at, last_error, failure_count, updated_at) ON public.chatbot_webhooks TO authenticated;
GRANT DELETE ON public.chatbot_webhooks TO authenticated;
GRANT ALL ON public.chatbot_webhooks TO service_role;