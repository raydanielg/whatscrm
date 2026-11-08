-- TikTok comments now sync through the TikTok Business connection
-- (tiktok_business_accounts), and TikTok DMs can be answered by a chatbot.

alter table public.social_inbox_sync_state
  drop constraint if exists social_inbox_sync_state_account_source_check;
alter table public.social_inbox_sync_state
  add constraint social_inbox_sync_state_account_source_check
  check (account_source in ('messenger_accounts', 'social_channels', 'tiktok_business_accounts'));

alter table public.chatbot_deployments
  drop constraint if exists chatbot_deployments_channel_check;
alter table public.chatbot_deployments
  add constraint chatbot_deployments_channel_check
  check (channel in ('whatsapp', 'instagram', 'messenger', 'telegram', 'livechat', 'web', 'sms', 'email', 'tiktok'));

notify pgrst, 'reload schema';

-- Inbox account picker: members may read the non-secret columns only
-- (token columns stay service-role only).
drop policy if exists "tiktok business accounts readable by members" on public.tiktok_business_accounts;
create policy "tiktok business accounts readable by members"
  on public.tiktok_business_accounts
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

grant select (id, workspace_id, business_id, username, display_name, avatar_url, status, last_error,
  last_event_at, created_at, updated_at) on public.tiktok_business_accounts to authenticated;

notify pgrst, 'reload schema';
