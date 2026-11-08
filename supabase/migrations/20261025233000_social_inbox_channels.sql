-- Social comment channels in the unified Inbox: Facebook Page comments,
-- YouTube comments, LinkedIn post comments and TikTok (Business) comments.
-- Conversations are keyed per (platform, account, post, commenter) and written
-- by the social-inbox sync worker / Meta feed webhook (service role only).

alter type public.inbox_channel add value if not exists 'facebook';
alter type public.inbox_channel add value if not exists 'youtube';
alter type public.inbox_channel add value if not exists 'linkedin';
alter type public.inbox_channel add value if not exists 'tiktok';

create table if not exists public.social_inbox_sync_state (
  account_source text not null check (account_source in ('messenger_accounts', 'social_channels')),
  account_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  platform text not null check (platform in ('facebook', 'youtube', 'linkedin', 'tiktok')),
  last_synced_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_result jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (account_source, account_id)
);

create index if not exists social_inbox_sync_state_workspace_idx
  on public.social_inbox_sync_state (workspace_id);

alter table public.social_inbox_sync_state enable row level security;

drop policy if exists "social inbox sync state readable by members" on public.social_inbox_sync_state;
create policy "social inbox sync state readable by members"
  on public.social_inbox_sync_state
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

revoke insert, update, delete on public.social_inbox_sync_state from authenticated, anon;
grant select on public.social_inbox_sync_state to authenticated;

-- Poll YouTube / LinkedIn / TikTok (and Facebook as a webhook backstop) every
-- five minutes through the existing Vault-backed cron helper.
do $migration$
begin
  if exists (select 1 from pg_proc where proname = '_wa_cron_post')
     and not exists (select 1 from cron.job where jobname = 'wa-social-inbox-sync') then
    perform cron.schedule(
      'wa-social-inbox-sync',
      '*/5 * * * *',
      $job$select public._wa_cron_post('/api/public/hooks/social-inbox-sync');$job$
    );
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
