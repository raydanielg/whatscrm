create table if not exists public.inbound_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  delivery_key text not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  signature_verified boolean not null default true,
  status text not null default 'received',
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint inbound_webhook_deliveries_provider_key_unique unique (provider, delivery_key)
);

create index if not exists idx_inbound_webhook_deliveries_workspace
  on public.inbound_webhook_deliveries (workspace_id, received_at desc);
create index if not exists idx_inbound_webhook_deliveries_provider
  on public.inbound_webhook_deliveries (provider, received_at desc);

grant select on public.inbound_webhook_deliveries to authenticated;
grant all on public.inbound_webhook_deliveries to service_role;

alter table public.inbound_webhook_deliveries enable row level security;

drop policy if exists "workspace members read inbound webhook deliveries" on public.inbound_webhook_deliveries;
create policy "workspace members read inbound webhook deliveries"
  on public.inbound_webhook_deliveries
  for select
  to authenticated
  using (workspace_id is not null and public.is_workspace_member(workspace_id, auth.uid()));