
create table if not exists public.chatbot_webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  url text not null,
  secret text not null,
  events text[] not null default array[
    'chatbot.created','chatbot.updated','chatbot.paused','chatbot.activated',
    'chatbot.restored','chatbot.deleted','chatbot.purged','chatbot.duplicated',
    'chatbot.installed.disabled','chatbot.installed.uninstalled'
  ],
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  last_delivered_at timestamptz,
  last_error text,
  failure_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chatbot_webhooks_url_len check (char_length(url) between 8 and 2000)
);
create index if not exists chatbot_webhooks_workspace_idx on public.chatbot_webhooks(workspace_id) where active;
grant select, insert, update, delete on public.chatbot_webhooks to authenticated;
grant all on public.chatbot_webhooks to service_role;
alter table public.chatbot_webhooks enable row level security;
create policy "chatbot_webhooks_select" on public.chatbot_webhooks for select to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = chatbot_webhooks.workspace_id and m.user_id = auth.uid() and m.status = 'active'));
create policy "chatbot_webhooks_write" on public.chatbot_webhooks for all to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = chatbot_webhooks.workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin','manager') and m.status = 'active'))
  with check (exists (select 1 from public.workspace_members m where m.workspace_id = chatbot_webhooks.workspace_id and m.user_id = auth.uid() and m.role in ('owner','admin','manager') and m.status = 'active'));

create table if not exists public.chatbot_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.chatbot_webhooks(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event text not null,
  chatbot_id uuid,
  payload jsonb not null,
  status text not null default 'pending',
  response_status integer,
  response_body text,
  attempts integer not null default 0,
  error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chatbot_webhook_deliveries_workspace_idx on public.chatbot_webhook_deliveries(workspace_id, created_at desc);
create index if not exists chatbot_webhook_deliveries_webhook_idx on public.chatbot_webhook_deliveries(webhook_id, created_at desc);
grant select, insert on public.chatbot_webhook_deliveries to authenticated;
grant all on public.chatbot_webhook_deliveries to service_role;
alter table public.chatbot_webhook_deliveries enable row level security;
create policy "chatbot_webhook_deliveries_select" on public.chatbot_webhook_deliveries for select to authenticated
  using (exists (select 1 from public.workspace_members m where m.workspace_id = chatbot_webhook_deliveries.workspace_id and m.user_id = auth.uid() and m.status = 'active'));

create or replace function public.tg_chatbot_webhooks_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists chatbot_webhooks_touch on public.chatbot_webhooks;
create trigger chatbot_webhooks_touch before update on public.chatbot_webhooks
  for each row execute function public.tg_chatbot_webhooks_touch();

create or replace function public.increment_webhook_failure(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.chatbot_webhooks set failure_count = failure_count + 1 where id = p_id;
$$;
grant execute on function public.increment_webhook_failure(uuid) to authenticated;
