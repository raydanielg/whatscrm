-- TikTok Business Messaging (direct messages) in the unified Inbox.
--
-- A TikTok Business account is connected through the TikTok API for Business
-- OAuth flow (separate from the Login Kit app used for publishing). Inbound
-- DMs arrive on the signed DIRECT_MESSAGE webhook and land in conversations
-- with channel = 'tiktok' and metadata.source = 'tiktok_dm'.
--
-- Tokens are encrypted by the app before they are stored. The table is
-- service-role only: the UI reads it through server functions that never
-- return token columns.

create table if not exists public.tiktok_business_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id text not null,
  username text,
  display_name text,
  avatar_url text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  scope text,
  status text not null default 'active' check (status in ('active', 'reauth_required', 'disconnected')),
  last_error text,
  last_event_at timestamptz,
  connected_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, business_id)
);

create index if not exists tiktok_business_accounts_business_idx
  on public.tiktok_business_accounts (business_id);

alter table public.tiktok_business_accounts enable row level security;
revoke all on public.tiktok_business_accounts from anon, authenticated;

notify pgrst, 'reload schema';
