-- Re-adding a tenant BYOK key failed with
--   duplicate key value violates unique constraint "secrets_name_idx"
-- when the provider row was gone but its Vault secret
-- (wacrm_ai_byok_<workspace>_<kind>) was left behind. Saving now reuses and
-- rotates a secret with that name instead of creating a second one, and the
-- delete RPC removes the secret by name as well as by id.

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
  v_secret_name text := 'wacrm_ai_byok_' || p_workspace_id::text || '_' || p_kind::text;
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
    into v_secret_id
    from public.ai_providers
   where workspace_id = p_workspace_id
     and kind = p_kind
     and credential_source = 'workspace'
     and vault_secret_id is not null
   limit 1;

  -- A secret left behind by an earlier removal is reused, not duplicated.
  if v_secret_id is null then
    select id into v_secret_id from vault.secrets where name = v_secret_name limit 1;
  end if;

  if v_secret_id is null then
    select vault.create_secret(trim(p_api_key), v_secret_name, 'WACRM tenant BYOK credential')
      into v_secret_id;
  else
    perform vault.update_secret(v_secret_id, trim(p_api_key));
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
  v_kind public.ai_provider_kind;
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
  returning vault_secret_id, kind into v_secret_id, v_kind;

  if v_kind is null then
    raise exception 'Workspace BYOK provider not found' using errcode = 'P0002';
  end if;

  delete from vault.secrets
   where id = v_secret_id
      or name = 'wacrm_ai_byok_' || p_workspace_id::text || '_' || v_kind::text;
end;
$$;

revoke all on function public.set_workspace_ai_provider_byok(uuid, public.ai_provider_kind, text, text, text, text) from public;
revoke all on function public.delete_workspace_ai_provider_byok(uuid, uuid) from public;
grant execute on function public.set_workspace_ai_provider_byok(uuid, public.ai_provider_kind, text, text, text, text) to authenticated;
grant execute on function public.delete_workspace_ai_provider_byok(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
