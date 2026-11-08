create type public.ai_provider_kind as enum (
  'lovable','openai','gemini','anthropic','deepseek','grok',
  'openrouter','ollama','lmstudio','custom_openai'
);
create type public.ai_operation as enum (
  'chat','stream','embed','image','transcribe','tts','moderation'
);
create type public.ai_request_status as enum (
  'success','error','rate_limited','timeout','cancelled'
);

create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind public.ai_provider_kind not null,
  name text not null,
  base_url text,
  api_key_secret_name text,
  organization_id text,
  enabled boolean not null default true,
  is_default boolean not null default false,
  priority integer not null default 100,
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, name)
);
create index ai_providers_workspace_idx on public.ai_providers(workspace_id, enabled, priority);
grant select, insert, update, delete on public.ai_providers to authenticated;
grant all on public.ai_providers to service_role;
alter table public.ai_providers enable row level security;
create policy "ai_providers members read" on public.ai_providers for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "ai_providers admins manage" on public.ai_providers for all to authenticated
  using (public.has_workspace_role(workspace_id, auth.uid(), array['owner'::workspace_role,'admin'::workspace_role]))
  with check (public.has_workspace_role(workspace_id, auth.uid(), array['owner'::workspace_role,'admin'::workspace_role]));

create table public.ai_models (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.ai_providers(id) on delete cascade,
  model_id text not null,
  display_name text not null,
  capabilities jsonb not null default '{}'::jsonb,
  context_window integer,
  max_output_tokens integer,
  input_cost_per_1k numeric(12,6) default 0,
  output_cost_per_1k numeric(12,6) default 0,
  enabled boolean not null default true,
  is_default boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (provider_id, model_id)
);
create index ai_models_provider_idx on public.ai_models(provider_id, enabled);
grant select, insert, update, delete on public.ai_models to authenticated;
grant all on public.ai_models to service_role;
alter table public.ai_models enable row level security;
create policy "ai_models members read" on public.ai_models for select to authenticated
  using (exists (select 1 from public.ai_providers p
                 where p.id = ai_models.provider_id
                   and public.is_workspace_member(p.workspace_id, auth.uid())));
create policy "ai_models admins manage" on public.ai_models for all to authenticated
  using (exists (select 1 from public.ai_providers p
                 where p.id = ai_models.provider_id
                   and public.has_workspace_role(p.workspace_id, auth.uid(), array['owner'::workspace_role,'admin'::workspace_role])))
  with check (exists (select 1 from public.ai_providers p
                 where p.id = ai_models.provider_id
                   and public.has_workspace_role(p.workspace_id, auth.uid(), array['owner'::workspace_role,'admin'::workspace_role])));

create table public.ai_feature_config (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  feature text not null,
  provider_id uuid references public.ai_providers(id) on delete set null,
  fallback_provider_ids uuid[] not null default '{}',
  model text,
  temperature numeric(3,2) default 0.7,
  max_tokens integer,
  system_prompt text,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (workspace_id, feature)
);
grant select, insert, update, delete on public.ai_feature_config to authenticated;
grant all on public.ai_feature_config to service_role;
alter table public.ai_feature_config enable row level security;
create policy "ai_feature_config members read" on public.ai_feature_config for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "ai_feature_config admins manage" on public.ai_feature_config for all to authenticated
  using (public.has_workspace_role(workspace_id, auth.uid(), array['owner'::workspace_role,'admin'::workspace_role]))
  with check (public.has_workspace_role(workspace_id, auth.uid(), array['owner'::workspace_role,'admin'::workspace_role]));

create table public.ai_prompts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  template text not null,
  variables text[] not null default '{}',
  system_prompt text,
  category text,
  version integer not null default 1,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, key, version)
);
create index ai_prompts_key_idx on public.ai_prompts(workspace_id, key, is_active);
grant select, insert, update, delete on public.ai_prompts to authenticated;
grant all on public.ai_prompts to service_role;
alter table public.ai_prompts enable row level security;
create policy "ai_prompts members read" on public.ai_prompts for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));
create policy "ai_prompts admins manage" on public.ai_prompts for all to authenticated
  using (public.has_workspace_role(workspace_id, auth.uid(), array['owner'::workspace_role,'admin'::workspace_role]))
  with check (public.has_workspace_role(workspace_id, auth.uid(), array['owner'::workspace_role,'admin'::workspace_role]));

create table public.ai_request_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid,
  provider_id uuid references public.ai_providers(id) on delete set null,
  provider_kind public.ai_provider_kind,
  model text,
  operation public.ai_operation not null default 'chat',
  feature text,
  status public.ai_request_status not null,
  http_status integer,
  latency_ms integer,
  prompt_tokens integer default 0,
  completion_tokens integer default 0,
  total_tokens integer default 0,
  cost_usd numeric(12,6) default 0,
  error_type text,
  error_message text,
  request_preview jsonb,
  response_preview jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index ai_logs_workspace_time_idx on public.ai_request_logs(workspace_id, created_at desc);
create index ai_logs_provider_idx on public.ai_request_logs(provider_id, created_at desc);
create index ai_logs_status_idx on public.ai_request_logs(status, created_at desc) where status <> 'success';
create index ai_logs_feature_idx on public.ai_request_logs(workspace_id, feature, created_at desc);
grant select on public.ai_request_logs to authenticated;
grant all on public.ai_request_logs to service_role;
alter table public.ai_request_logs enable row level security;
create policy "ai_logs members read" on public.ai_request_logs for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

create table public.ai_provider_health (
  provider_id uuid primary key references public.ai_providers(id) on delete cascade,
  status text not null default 'unknown',
  last_check_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  latency_ms integer,
  consecutive_failures integer not null default 0,
  updated_at timestamptz not null default now()
);
grant select on public.ai_provider_health to authenticated;
grant all on public.ai_provider_health to service_role;
alter table public.ai_provider_health enable row level security;
create policy "ai_health members read" on public.ai_provider_health for select to authenticated
  using (exists (select 1 from public.ai_providers p
                 where p.id = ai_provider_health.provider_id
                   and public.is_workspace_member(p.workspace_id, auth.uid())));

create table public.ai_usage_daily (
  workspace_id uuid not null,
  day date not null,
  provider_id uuid,
  model text not null default '',
  requests integer not null default 0,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  total_tokens bigint not null default 0,
  cost_usd numeric(14,6) not null default 0,
  errors integer not null default 0,
  primary key (workspace_id, day, provider_id, model)
);
grant select on public.ai_usage_daily to authenticated;
grant all on public.ai_usage_daily to service_role;
alter table public.ai_usage_daily enable row level security;
create policy "ai_usage_daily members read" on public.ai_usage_daily for select to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

create or replace function public.upsert_ai_usage_daily(
  p_workspace_id uuid, p_day date, p_provider_id uuid, p_model text,
  p_requests integer, p_prompt_tokens integer, p_completion_tokens integer,
  p_total_tokens integer, p_cost_usd numeric, p_errors integer
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.ai_usage_daily as u
    (workspace_id, day, provider_id, model, requests, prompt_tokens, completion_tokens, total_tokens, cost_usd, errors)
  values (p_workspace_id, p_day, p_provider_id, coalesce(p_model,''), p_requests, p_prompt_tokens, p_completion_tokens, p_total_tokens, p_cost_usd, p_errors)
  on conflict (workspace_id, day, provider_id, model) do update
    set requests = u.requests + excluded.requests,
        prompt_tokens = u.prompt_tokens + excluded.prompt_tokens,
        completion_tokens = u.completion_tokens + excluded.completion_tokens,
        total_tokens = u.total_tokens + excluded.total_tokens,
        cost_usd = u.cost_usd + excluded.cost_usd,
        errors = u.errors + excluded.errors;
end $$;
grant execute on function public.upsert_ai_usage_daily(uuid,date,uuid,text,integer,integer,integer,integer,numeric,integer) to authenticated, service_role;

create or replace function public.enforce_single_default_ai_provider()
returns trigger language plpgsql as $$
begin
  if new.is_default then
    update public.ai_providers set is_default = false
      where workspace_id = new.workspace_id and id <> new.id;
  end if;
  return new;
end $$;
create trigger ai_providers_single_default
  before insert or update of is_default on public.ai_providers
  for each row when (new.is_default) execute function public.enforce_single_default_ai_provider();

insert into public.ai_providers (workspace_id, kind, name, api_key_secret_name, is_default, priority)
select id, 'lovable', 'Lovable AI', 'LOVABLE_API_KEY', true, 10 from public.workspaces
on conflict (workspace_id, name) do nothing;

create or replace function public.seed_default_ai_provider()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ai_providers (workspace_id, kind, name, api_key_secret_name, is_default, priority)
  values (new.id, 'lovable', 'Lovable AI', 'LOVABLE_API_KEY', true, 10)
  on conflict (workspace_id, name) do nothing;
  return new;
end $$;
create trigger workspaces_seed_ai_provider
  after insert on public.workspaces
  for each row execute function public.seed_default_ai_provider();