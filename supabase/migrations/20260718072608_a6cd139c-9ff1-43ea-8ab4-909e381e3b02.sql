alter table public.api_keys
  add column if not exists ip_allowlist text[] default '{}'::text[],
  add column if not exists rotated_from uuid references public.api_keys(id) on delete set null,
  add column if not exists description text;
create index if not exists idx_api_keys_org on public.api_keys(organization_id) where revoked_at is null;