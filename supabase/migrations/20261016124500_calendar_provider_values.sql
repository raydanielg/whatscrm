-- Align the original calendar constraints with the direct OAuth providers and UI.
ALTER TABLE public.calendar_accounts DROP CONSTRAINT IF EXISTS calendar_accounts_provider_check;
ALTER TABLE public.calendar_accounts ADD CONSTRAINT calendar_accounts_provider_check
  CHECK (provider IN ('google', 'microsoft', 'outlook', 'ical', 'apple'));

UPDATE public.calendar_accounts
SET sync_direction = CASE sync_direction
  WHEN 'pull' THEN 'inbound'
  WHEN 'push' THEN 'outbound'
  WHEN 'both' THEN 'bidirectional'
  ELSE 'bidirectional' END,
  enabled = CASE WHEN sync_direction = 'none' THEN false ELSE enabled END
WHERE sync_direction IN ('pull', 'push', 'both', 'none');
ALTER TABLE public.calendar_accounts DROP CONSTRAINT IF EXISTS calendar_accounts_sync_direction_check;
ALTER TABLE public.calendar_accounts ALTER COLUMN sync_direction SET DEFAULT 'bidirectional';
ALTER TABLE public.calendar_accounts ADD CONSTRAINT calendar_accounts_sync_direction_check
  CHECK (sync_direction IN ('inbound', 'outbound', 'bidirectional'));
