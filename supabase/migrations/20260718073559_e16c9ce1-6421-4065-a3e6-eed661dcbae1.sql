-- Tenant-created webhook subscriptions
create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  created_by uuid not null,
  name text not null,
  description text,
  url text not null,
  events text[] not null default '{}',           -- e.g. ['contact.created','message.sent','*']
  secret_hash text not null,                     -- SHA-256 hash of signing secret
  secret_prefix text not null,                   -- first 8 chars for UI display
  status text not null default 'active' check (status in ('active','paused','disabled')),
  headers jsonb not null default '{}'::jsonb,    -- optional custom headers
  timeout_ms integer not null default 10000 check (timeout_ms between 1000 and 30000),
  max_retries integer not null default 8 check (max_retries between 0 and 20),
  -- Health tracking
  consecutive_failures integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_status_code integer,
  auto_disabled_at timestamptz,
  auto_disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_webhook_endpoints_org on public.webhook_endpoints(organization_id);
create index if not exists idx_webhook_endpoints_status on public.webhook_endpoints(status) where status = 'active';

grant select, insert, update, delete on public.webhook_endpoints to authenticated;
grant all on public.webhook_endpoints to service_role;
alter table public.webhook_endpoints enable row level security;
create policy "org members manage own webhooks" on public.webhook_endpoints for all to authenticated
  using (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()))
  with check (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()));

-- Individual delivery attempts (queue + history combined)
create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  organization_id uuid not null,
  event_type text not null,
  event_id text not null,           -- idempotency: unique per (endpoint_id, event_id)
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','delivering','succeeded','failed','dead_letter','cancelled')),
  attempt integer not null default 0,
  max_attempts integer not null default 8,
  next_attempt_at timestamptz not null default now(),
  -- Attempt result
  response_status integer,
  response_headers jsonb,
  response_body text,
  duration_ms integer,
  error_message text,
  -- Locking (worker lease)
  locked_at timestamptz,
  locked_by text,
  -- Timeline
  created_at timestamptz not null default now(),
  first_attempted_at timestamptz,
  last_attempted_at timestamptz,
  succeeded_at timestamptz,
  dead_letter_at timestamptz,
  -- Replay tracking
  replay_of uuid references public.webhook_deliveries(id) on delete set null
);
create index if not exists idx_wdeliv_queue on public.webhook_deliveries(next_attempt_at)
  where status in ('pending','delivering');
create index if not exists idx_wdeliv_endpoint on public.webhook_deliveries(endpoint_id, created_at desc);
create index if not exists idx_wdeliv_org on public.webhook_deliveries(organization_id, created_at desc);
create unique index if not exists uq_wdeliv_event on public.webhook_deliveries(endpoint_id, event_id) where replay_of is null;

grant select on public.webhook_deliveries to authenticated;
grant all on public.webhook_deliveries to service_role;
alter table public.webhook_deliveries enable row level security;
create policy "org members read own deliveries" on public.webhook_deliveries for select to authenticated
  using (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()));