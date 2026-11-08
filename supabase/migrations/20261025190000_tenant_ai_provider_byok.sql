-- Tenant-owned AI credentials are encrypted with Supabase Vault. Only the
-- service-role runtime can read plaintext; workspace owners/admins may rotate
-- or remove their own key through the narrowly scoped RPCs below.

create extension if not exists supabase_vault with schema vault;

alter table public.ai_providers
  add column if not exists credential_source text not null default 'platform',
  add column if not exists vault_secret_id uuid,
  add column if not exists api_key_last4 text;

alter table public.ai_providers
  drop constraint if exists ai_providers_credential_source_check;
alter table public.ai_providers
  add constraint ai_providers_credential_source_check
  check (credential_source in ('platform', 'workspace'));

create unique index if not exists ai_providers_one_workspace_byok_per_kind
  on public.ai_providers (workspace_id, kind)
  where credential_source = 'workspace';

create or replace function public.set_workspace_ai_provider_byok(
  p_workspace_id uuid,
  p_kind public.ai_provider_kind,
  p_name text,
  p_api_key text,
  p_base_url text default null,
  p_organization_id text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_id uuid;
  v_secret_id uuid;
  v_existing_secret_id uuid;
begin
  if auth.uid() is null or not public.has_workspace_role(
    p_workspace_id,
    auth.uid(),
    array['owner'::public.workspace_role, 'admin'::public.workspace_role]
  ) then
    raise exception 'Only workspace owners and admins can manage BYOK credentials'
      using errcode = '42501';
  end if;

  if p_kind not in ('openai'::public.ai_provider_kind, 'gemini'::public.ai_provider_kind) then
    raise exception 'Tenant BYOK currently supports OpenAI and Gemini only'
      using errcode = '22023';
  end if;

  if length(trim(p_api_key)) < 12 then
    raise exception 'Enter a valid API key' using errcode = '22023';
  end if;

  select vault_secret_id
    into v_existing_secret_id
    from public.ai_providers
   where workspace_id = p_workspace_id
     and kind = p_kind
     and credential_source = 'workspace'
   limit 1;

  if v_existing_secret_id is null then
    select vault.create_secret(
      trim(p_api_key),
      'wacrm_ai_byok_' || p_workspace_id::text || '_' || p_kind::text,
      'WACRM tenant BYOK credential'
    ) into v_secret_id;
  else
    perform vault.update_secret(v_existing_secret_id, trim(p_api_key));
    v_secret_id := v_existing_secret_id;
  end if;

  insert into public.ai_providers (
    workspace_id, kind, name, base_url, organization_id, enabled, is_default,
    priority, credential_source, vault_secret_id, api_key_last4, created_by,
    api_key_secret_name
  ) values (
    p_workspace_id, p_kind, trim(p_name), nullif(trim(p_base_url), ''),
    nullif(trim(p_organization_id), ''), true, false, 50, 'workspace',
    v_secret_id, right(trim(p_api_key), 4), auth.uid(), null
  )
  on conflict (workspace_id, kind) where credential_source = 'workspace'
  do update set
    name = excluded.name,
    base_url = excluded.base_url,
    organization_id = excluded.organization_id,
    enabled = true,
    vault_secret_id = excluded.vault_secret_id,
    api_key_last4 = excluded.api_key_last4,
    api_key_secret_name = null,
    updated_at = now()
  returning id into v_provider_id;

  return v_provider_id;
end;
$$;

create or replace function public.delete_workspace_ai_provider_byok(
  p_workspace_id uuid,
  p_provider_id uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if auth.uid() is null or not public.has_workspace_role(
    p_workspace_id,
    auth.uid(),
    array['owner'::public.workspace_role, 'admin'::public.workspace_role]
  ) then
    raise exception 'Only workspace owners and admins can manage BYOK credentials'
      using errcode = '42501';
  end if;

  delete from public.ai_providers
   where id = p_provider_id
     and workspace_id = p_workspace_id
     and credential_source = 'workspace'
  returning vault_secret_id into v_secret_id;

  if v_secret_id is null then
    raise exception 'Workspace BYOK provider not found' using errcode = 'P0002';
  end if;

  delete from vault.secrets where id = v_secret_id;
end;
$$;

create or replace function public.get_ai_provider_vault_key(p_provider_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select ds.decrypted_secret
    into v_key
    from public.ai_providers p
    join vault.decrypted_secrets ds on ds.id = p.vault_secret_id
   where p.id = p_provider_id
     and p.credential_source = 'workspace'
     and p.enabled = true;

  return v_key;
end;
$$;

revoke all on function public.set_workspace_ai_provider_byok(uuid, public.ai_provider_kind, text, text, text, text) from public;
revoke all on function public.delete_workspace_ai_provider_byok(uuid, uuid) from public;
revoke all on function public.get_ai_provider_vault_key(uuid) from public;
grant execute on function public.set_workspace_ai_provider_byok(uuid, public.ai_provider_kind, text, text, text, text) to authenticated;
grant execute on function public.delete_workspace_ai_provider_byok(uuid, uuid) to authenticated;
grant execute on function public.get_ai_provider_vault_key(uuid) to service_role;

-- Provider/model writes must go through the guarded server actions/RPCs.
-- This prevents a tenant from pointing a provider row at an arbitrary server
-- environment variable or another Vault secret through the Data API.
revoke insert, update, delete on public.ai_providers from authenticated;
revoke insert, update, delete on public.ai_models from authenticated;

comment on column public.ai_providers.credential_source is
  'platform = server environment secret; workspace = tenant BYOK encrypted in Vault';
comment on column public.ai_providers.api_key_last4 is
  'Non-secret display hint. The plaintext key is never stored in public tables.';

-- Keep existing provider rows aligned with the small, current production
-- catalog used by WACRM's text/chat features.
delete from public.ai_models m
using public.ai_providers p
where m.provider_id = p.id
  and p.kind = 'openai'
  and m.model_id not in (
    'gpt-6-luna', 'gpt-5.6-luna', 'gpt-5.4-mini',
    'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.5'
  );

delete from public.ai_models m
using public.ai_providers p
where m.provider_id = p.id
  and p.kind = 'gemini'
  and m.model_id not in (
    'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite',
    'gemini-3.6-flash', 'gemini-3.5-flash',
    'gemini-3.8-flash', 'gemini-4-argon'
  );

insert into public.ai_models
  (provider_id, model_id, display_name, enabled, is_default, sort_order,
   input_cost_per_1k, output_cost_per_1k)
select p.id, catalog.model_id, catalog.display_name, true, catalog.is_default,
  catalog.sort_order, catalog.input_cost, catalog.output_cost
from public.ai_providers p
cross join (values
  ('gpt-6-luna', 'GPT-6 Luna · Budget', true, 0, 0.000100, 0.000500),
  ('gpt-5.6-luna', 'GPT-5.6 Luna · Budget', false, 10, 0.000200, 0.001200),
  ('gpt-5.4-mini', 'GPT-5.4 Mini · Balanced', false, 20, 0.000750, 0.004500),
  ('gpt-5.6-terra', 'GPT-5.6 Terra · Balanced', false, 30, 0.002000, 0.012000),
  ('gpt-5.6-sol', 'GPT-5.6 Sol · Premium', false, 40, 0.004000, 0.020000),
  ('gpt-5.5', 'GPT-5.5 · Premium', false, 50, 0.005000, 0.030000)
) as catalog(model_id, display_name, is_default, sort_order, input_cost, output_cost)
where p.kind = 'openai'
on conflict (provider_id, model_id) do update set
  display_name = excluded.display_name,
  enabled = true,
  is_default = excluded.is_default,
  sort_order = excluded.sort_order,
  input_cost_per_1k = excluded.input_cost_per_1k,
  output_cost_per_1k = excluded.output_cost_per_1k;

insert into public.ai_models
  (provider_id, model_id, display_name, enabled, is_default, sort_order,
   input_cost_per_1k, output_cost_per_1k)
select p.id, catalog.model_id, catalog.display_name, true, catalog.is_default,
  catalog.sort_order, catalog.input_cost, catalog.output_cost
from public.ai_providers p
cross join (values
  ('gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite · Budget', true, 0, 0.000250, 0.001500),
  ('gemini-3.5-flash-lite', 'Gemini 3.5 Flash Lite · Budget', false, 10, 0.000300, 0.002500),
  ('gemini-3.6-flash', 'Gemini 3.6 Flash · Balanced', false, 20, 0.000750, 0.003750),
  ('gemini-3.5-flash', 'Gemini 3.5 Flash · Balanced', false, 30, 0.001500, 0.009000),
  ('gemini-3.8-flash', 'Gemini 3.8 Flash · Premium', false, 40, 0.000750, 0.003750),
  ('gemini-4-argon', 'Gemini 4 Argon · Premium', false, 50, 0.002000, 0.010000)
) as catalog(model_id, display_name, is_default, sort_order, input_cost, output_cost)
where p.kind = 'gemini'
on conflict (provider_id, model_id) do update set
  display_name = excluded.display_name,
  enabled = true,
  is_default = excluded.is_default,
  sort_order = excluded.sort_order,
  input_cost_per_1k = excluded.input_cost_per_1k,
  output_cost_per_1k = excluded.output_cost_per_1k;

update public.ai_settings s
set default_model = case p.kind
  when 'openai' then 'gpt-6-luna'
  when 'gemini' then 'gemini-3.1-flash-lite'
  else s.default_model
end,
updated_at = now()
from public.ai_providers p
where p.id = s.default_provider_id
  and p.kind in ('openai', 'gemini')
  and not exists (
    select 1 from public.ai_models m
    where m.provider_id = p.id
      and m.model_id = s.default_model
      and m.enabled = true
  );

-- Make the newly-created RPCs available to PostgREST immediately after deploy.
notify pgrst, 'reload schema';
