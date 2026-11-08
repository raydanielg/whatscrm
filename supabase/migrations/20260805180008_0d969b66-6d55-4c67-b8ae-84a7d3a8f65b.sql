-- ============ messenger_accounts ============
DROP POLICY IF EXISTS "messenger_accounts by workspace member" ON public.messenger_accounts;

CREATE POLICY "Members read messenger accounts"
ON public.messenger_accounts FOR SELECT TO authenticated
USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace admins manage messenger accounts"
ON public.messenger_accounts FOR ALL TO authenticated
USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]))
WITH CHECK (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

REVOKE SELECT ON public.messenger_accounts FROM authenticated;
GRANT SELECT (id, workspace_id, page_id, page_name, category, profile_picture_url,
              token_expires_at, scopes, status, status_reason, connected_by,
              connected_at, last_verified_at, metadata, created_at, updated_at)
ON public.messenger_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.messenger_accounts TO authenticated;
GRANT ALL ON public.messenger_accounts TO service_role;

-- ============ sms_accounts ============
DROP POLICY IF EXISTS "Workspace members read sms accounts" ON public.sms_accounts;

CREATE POLICY "Members read sms accounts"
ON public.sms_accounts FOR SELECT TO authenticated
USING (is_workspace_member(workspace_id, auth.uid()));

REVOKE SELECT ON public.sms_accounts FROM authenticated;
GRANT SELECT (id, workspace_id, provider, display_name, phone_number, phone_digits,
              account_sid, status, status_reason, metadata, connected_at, connected_by,
              last_verified_at, created_at, updated_at)
ON public.sms_accounts TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.sms_accounts TO authenticated;
GRANT ALL ON public.sms_accounts TO service_role;

-- ============ social_channels ============
DROP POLICY IF EXISTS "ws members manage social channels" ON public.social_channels;

CREATE POLICY "Members read social channels"
ON public.social_channels FOR SELECT TO authenticated
USING (is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "Workspace admins manage social channels"
ON public.social_channels FOR ALL TO authenticated
USING (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]))
WITH CHECK (has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role, 'admin'::workspace_role]));

REVOKE SELECT ON public.social_channels FROM authenticated;
GRANT SELECT (id, workspace_id, platform, name, external_id, username, avatar_url,
              token_expires_at, status, metadata, created_by, created_at, updated_at)
ON public.social_channels TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.social_channels TO authenticated;
GRANT ALL ON public.social_channels TO service_role;