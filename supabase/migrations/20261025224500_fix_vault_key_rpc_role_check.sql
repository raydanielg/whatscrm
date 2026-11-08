-- get_ai_provider_vault_key (20261025190000) gated itself with
-- `current_setting('request.jwt.claim.role', true) <> 'service_role'`, a
-- per-claim GUC style this codebase does not use anywhere else and which is
-- not reliably populated by PostgREST here — the check always failed closed,
-- so EVERY tenant BYOK key was unreadable at runtime ("Unable to load the
-- encrypted API key") even though the Vault secret itself decrypts fine.
-- The rest of this codebase consistently uses `auth.role()` for this exact
-- check (see 20260922150000_9d2f4a17-..., prune_gateway_webhook_deliveries).
CREATE OR REPLACE FUNCTION public.get_ai_provider_vault_key(p_provider_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
declare
  v_key text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
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

NOTIFY pgrst, 'reload schema';
