-- 1. account_lockouts: read-only for the owner, writes only via service role / definer functions
DROP POLICY IF EXISTS "own lockout" ON public.account_lockouts;

CREATE POLICY "own lockout read"
ON public.account_lockouts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.account_lockouts FROM authenticated;
GRANT SELECT ON public.account_lockouts TO authenticated;
GRANT ALL ON public.account_lockouts TO service_role;

-- 2. social_channels: hide the plaintext access token from every client role
REVOKE SELECT (access_token) ON public.social_channels FROM authenticated;
REVOKE SELECT (access_token) ON public.social_channels FROM anon;
REVOKE UPDATE (access_token) ON public.social_channels FROM authenticated;
REVOKE UPDATE (access_token) ON public.social_channels FROM anon;
GRANT ALL ON public.social_channels TO service_role;