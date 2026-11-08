-- 20260805180008 granted table-wide INSERT/UPDATE (no column list) to
-- `authenticated`. Postgres unions table-level and column-level privileges —
-- a column-level REVOKE (as issued in 20260803111812, 20260807085225 and
-- 20260929140000) never cancels a table-level GRANT — so `authenticated`
-- could still blind-write access_token, and now refresh_token /
-- refresh_token_expires_at, even though none of the three are readable.
-- SELECT was never affected by this; only INSERT/UPDATE were. This restores
-- the same allowed-column set those earlier migrations intended, this time
-- as the only INSERT/UPDATE grant on the table so nothing re-opens it.
REVOKE INSERT, UPDATE ON public.social_channels FROM authenticated;

GRANT INSERT (
  id, workspace_id, platform, name, external_id, username, avatar_url,
  token_expires_at, status, metadata, created_by, created_at, updated_at
) ON public.social_channels TO authenticated;

GRANT UPDATE (
  name, external_id, username, avatar_url, token_expires_at, status, metadata, updated_at
) ON public.social_channels TO authenticated;

GRANT ALL ON public.social_channels TO service_role;
