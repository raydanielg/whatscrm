-- Campaign dispatch claim/expire functions must be callable only by the
-- server-side dispatch worker (service_role). The public schema's default
-- privileges grant EXECUTE to anon/authenticated explicitly on function
-- creation, so `REVOKE ALL ... FROM PUBLIC` in 20260929120000 did not remove
-- those grants. Revoke them explicitly here.

REVOKE EXECUTE ON FUNCTION public.claim_campaign_dispatch_batch(text, integer, interval)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.expire_campaign_dispatch_attempts(interval)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_campaign_dispatch_batch(text, integer, interval)
TO service_role;

GRANT EXECUTE ON FUNCTION public.expire_campaign_dispatch_attempts(interval)
TO service_role;
