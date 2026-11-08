
-- Push tokens
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('ios','android','web')),
  device_name text,
  app_version text,
  disabled boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);
create index if not exists push_tokens_user_idx on public.push_tokens(user_id) where disabled = false;

grant select, insert, update, delete on public.push_tokens to authenticated;
grant all on public.push_tokens to service_role;
alter table public.push_tokens enable row level security;

drop policy if exists "own push tokens" on public.push_tokens;
create policy "own push tokens" on public.push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Notification preferences: one row per (user, category)
create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  push_enabled boolean not null default true,
  email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;
alter table public.notification_preferences enable row level security;

drop policy if exists "own notification prefs" on public.notification_preferences;
create policy "own notification prefs" on public.notification_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-dispatch: after every insert on notifications, POST to the mobile dispatch endpoint
create extension if not exists pg_net;

create or replace function public.dispatch_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  endpoint text := 'https://project--206182b2-0a34-4382-9e54-92466a9ffea8.lovable.app/api/public/push-dispatch';
  anon_key text := 'sb_publishable_vIQQo4PPa-PbG3Zs-kz5vw_bdCne7Sh';
begin
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type','application/json','apikey', anon_key),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
exception when others then
  -- Never block the insert on push delivery
  return new;
end;
$$;

drop trigger if exists notifications_push_dispatch on public.notifications;
create trigger notifications_push_dispatch
  after insert on public.notifications
  for each row execute function public.dispatch_notification_push();
