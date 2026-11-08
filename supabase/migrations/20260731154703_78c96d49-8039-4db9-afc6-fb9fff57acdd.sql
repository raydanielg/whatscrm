
-- 1. Coupons: restrict to platform staff instead of every signed-in user
DROP POLICY IF EXISTS "Authenticated read active coupons" ON public.coupons;
CREATE POLICY "Platform staff read coupons" ON public.coupons
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'superadmin'::app_role)
    OR public.has_role(auth.uid(), 'support'::app_role)
  );

-- 2. plugin_downloads: cannot forge someone else's download
DROP POLICY IF EXISTS "Anyone signed in logs downloads" ON public.plugin_downloads;
CREATE POLICY "Users log their own downloads" ON public.plugin_downloads
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      workspace_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = plugin_downloads.workspace_id
          AND wm.user_id = auth.uid()
      )
    )
  );

-- 3. provider_media_cache: no orphan-row exposure
DROP POLICY IF EXISTS "media_cache: workspace members read" ON public.provider_media_cache;
CREATE POLICY "media_cache: workspace members read" ON public.provider_media_cache
  FOR SELECT TO authenticated
  USING (
    channel_account_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.channel_accounts ca
      WHERE ca.id = provider_media_cache.channel_account_id
        AND public.is_workspace_member(ca.workspace_id, auth.uid())
    )
  );

-- 4. wa_qr_webhook_deliveries: unassigned rows are not public
DROP POLICY IF EXISTS "Members view their workspace deliveries" ON public.wa_qr_webhook_deliveries;
CREATE POLICY "Members view their workspace deliveries" ON public.wa_qr_webhook_deliveries
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = wa_qr_webhook_deliveries.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- 5. Cron helper now sends the private cron token instead of the public anon key
CREATE OR REPLACE FUNCTION public._wa_cron_post(_path text, _body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _base text := 'https://project--206182b2-0a34-4382-9e54-92466a9ffea8.lovable.app';
  _token text := '3b458e0c03856e1ec5db7698d05a90bcedbbfafe70ab27797141bf8ce1560b59';
  _req bigint;
BEGIN
  SELECT net.http_post(
    url := _base || _path,
    headers := jsonb_build_object('Content-Type','application/json','x-cron-token',_token),
    body := _body,
    timeout_milliseconds := 55000
  ) INTO _req;
  RETURN _req;
END;
$fn$;

-- 6. Re-point the remaining direct http_post cron jobs at the token helper
SELECT cron.schedule('flush-scheduled-messages', '* * * * *', $$SELECT public._wa_cron_post('/api/public/hooks/flush-scheduled-messages');$$);
SELECT cron.schedule('swiffer-run-scheduled-syncs', '*/2 * * * *', $$SELECT public._wa_cron_post('/api/public/hooks/run-scheduled-syncs');$$);
SELECT cron.schedule('swiffer-workflow-queue', '* * * * *', $$SELECT public._wa_cron_post('/api/public/hooks/workflow-queue');$$);
SELECT cron.schedule('export-jobs-dispatch', '* * * * *', $$SELECT public._wa_cron_post('/api/public/hooks/process-exports', '{"source":"pg_cron"}'::jsonb);$$);
SELECT cron.schedule('billing-daily-revenue-rollup', '15 0 * * *', $$SELECT public._wa_cron_post('/api/public/hooks/billing/rollup');$$);
SELECT cron.schedule('billing-automation-15min', '*/15 * * * *', $$SELECT public._wa_cron_post('/api/public/hooks/billing/automation');$$);
SELECT cron.schedule('sla-breach-scanner', '*/5 * * * *', $$SELECT public._wa_cron_post('/api/public/hooks/sla-scan');$$);
SELECT cron.schedule('birthday-reminders-daily', '0 8 * * *', $$SELECT public._wa_cron_post('/api/public/hooks/birthday-reminders');$$);
SELECT cron.schedule('task-reminders-every-5min', '*/5 * * * *', $$SELECT public._wa_cron_post('/api/public/hooks/task-reminders');$$);
