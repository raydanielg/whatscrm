create table if not exists public.api_gateway_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  api_key_id uuid references public.api_keys(id) on delete set null,
  method text not null,
  path text not null,
  version text not null default 'v1',
  status_code int,
  latency_ms int,
  ip inet,
  user_agent text,
  error text,
  created_at timestamptz not null default now()
);

grant select on public.api_gateway_logs to authenticated;
grant all on public.api_gateway_logs to service_role;

alter table public.api_gateway_logs enable row level security;

create policy "Org members read gateway logs"
  on public.api_gateway_logs for select to authenticated
  using (
    organization_id in (
      select organization_id from public.organization_members where user_id = auth.uid()
    )
  );

create index if not exists idx_api_gateway_logs_org_created on public.api_gateway_logs(organization_id, created_at desc);
create index if not exists idx_api_gateway_logs_key on public.api_gateway_logs(api_key_id, created_at desc);