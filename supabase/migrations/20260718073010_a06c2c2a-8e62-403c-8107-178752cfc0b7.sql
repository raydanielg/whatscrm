-- OAuth clients
create table if not exists public.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  created_by uuid not null,
  client_id text unique not null,
  client_secret_hash text, -- null for public clients
  client_type text not null check (client_type in ('confidential','public')),
  name text not null,
  description text,
  logo_url text,
  homepage_url text,
  privacy_url text,
  tos_url text,
  redirect_uris text[] not null default '{}',
  allowed_grant_types text[] not null default array['authorization_code','refresh_token'],
  allowed_scopes text[] not null default array['openid','profile','email'],
  require_pkce boolean not null default true,
  is_first_party boolean not null default false, -- skip consent
  approved boolean not null default false,       -- platform approval
  approved_at timestamptz,
  approved_by uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.oauth_clients to authenticated;
grant all on public.oauth_clients to service_role;
alter table public.oauth_clients enable row level security;
create policy "org members read own clients" on public.oauth_clients for select to authenticated
  using (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()));
create policy "org members manage own clients" on public.oauth_clients for all to authenticated
  using (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()))
  with check (organization_id in (select organization_id from public.organization_members where user_id = auth.uid()));

-- Authorization codes (short-lived)
create table if not exists public.oauth_authorization_codes (
  code_hash text primary key,
  client_id uuid not null references public.oauth_clients(id) on delete cascade,
  user_id uuid not null,
  organization_id uuid not null,
  redirect_uri text not null,
  scopes text[] not null default '{}',
  code_challenge text,
  code_challenge_method text check (code_challenge_method in ('S256','plain')),
  nonce text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
grant all on public.oauth_authorization_codes to service_role;
alter table public.oauth_authorization_codes enable row level security;

-- Access tokens
create table if not exists public.oauth_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  client_id uuid not null references public.oauth_clients(id) on delete cascade,
  user_id uuid,  -- null for client_credentials
  organization_id uuid not null,
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_oauth_at_client on public.oauth_access_tokens(client_id);
create index if not exists idx_oauth_at_user on public.oauth_access_tokens(user_id);
grant all on public.oauth_access_tokens to service_role;
grant select on public.oauth_access_tokens to authenticated;
alter table public.oauth_access_tokens enable row level security;
create policy "user reads own tokens" on public.oauth_access_tokens for select to authenticated
  using (user_id = auth.uid());

-- Refresh tokens (rotating)
create table if not exists public.oauth_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null,
  access_token_id uuid references public.oauth_access_tokens(id) on delete set null,
  client_id uuid not null references public.oauth_clients(id) on delete cascade,
  user_id uuid not null,
  organization_id uuid not null,
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by uuid references public.oauth_refresh_tokens(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_oauth_rt_client_user on public.oauth_refresh_tokens(client_id, user_id);
grant all on public.oauth_refresh_tokens to service_role;
alter table public.oauth_refresh_tokens enable row level security;

-- Consents: which user allowed which client with which scopes
create table if not exists public.oauth_user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_id uuid not null references public.oauth_clients(id) on delete cascade,
  scopes text[] not null default '{}',
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (user_id, client_id)
);
grant select, insert, update, delete on public.oauth_user_consents to authenticated;
grant all on public.oauth_user_consents to service_role;
alter table public.oauth_user_consents enable row level security;
create policy "user manages own consents" on public.oauth_user_consents for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());