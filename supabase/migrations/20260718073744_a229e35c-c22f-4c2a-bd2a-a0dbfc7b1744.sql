create table if not exists public.webhook_endpoint_secrets (
  endpoint_id uuid primary key references public.webhook_endpoints(id) on delete cascade,
  secret text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);
-- No authenticated grants: only service_role can read/write. Tenants see the
-- plaintext once via the create/rotate server fns and never again.
grant all on public.webhook_endpoint_secrets to service_role;
alter table public.webhook_endpoint_secrets enable row level security;