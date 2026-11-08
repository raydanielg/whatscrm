-- Send important events from existing module records to the user-scoped header feed.
-- Source tables keep their own history; notifications are private copies for recipients.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_event_key_idx
  ON public.notifications (user_id, (data ->> 'event_key'))
  WHERE data ? 'event_key';

CREATE OR REPLACE FUNCTION public.emit_module_notification(
  p_user_id uuid,
  p_organization_id uuid,
  p_event_key text,
  p_category text,
  p_title text,
  p_body text,
  p_action_url text,
  p_data jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_user_id IS NULL OR p_organization_id IS NULL OR p_event_key IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications
    (user_id, organization_id, channel, status, category, title, body, action_url, data)
  VALUES
    (p_user_id, p_organization_id, 'in_app', 'unread', p_category, p_title, p_body,
     p_action_url, coalesce(p_data, '{}'::jsonb) || jsonb_build_object('event_key', p_event_key))
  ON CONFLICT DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.emit_module_notification(uuid, uuid, text, text, text, text, text, jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.notify_workflow_failure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  org_id uuid;
  owner_id uuid;
  workflow_name text;
  recipient uuid;
BEGIN
  IF NEW.status <> 'failed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  END IF;
  SELECT w.organization_id, w.owner_id INTO org_id, owner_id
    FROM public.workspaces w WHERE w.id = NEW.workspace_id;
  SELECT a.name INTO workflow_name FROM public.automations a WHERE a.id = NEW.automation_id;
  FOR recipient IN
    SELECT m.user_id FROM public.workspace_members m
      WHERE m.workspace_id = NEW.workspace_id AND m.status = 'active' AND m.role IN ('owner', 'admin')
    UNION SELECT owner_id WHERE owner_id IS NOT NULL
  LOOP
    PERFORM public.emit_module_notification(
      recipient, org_id, 'workflow-failed:' || NEW.id::text, 'automation',
      'Workflow failed: ' || coalesce(workflow_name, 'Automation'),
      'Open the workflow to review the failed run.',
      '/automations/' || NEW.automation_id::text,
      jsonb_build_object('workflow_id', NEW.automation_id, 'run_id', NEW.id, 'workspace_id', NEW.workspace_id)
    );
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Workflow notification failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_workflow_failure() FROM PUBLIC;
CREATE TRIGGER workflow_failure_header_notification
  AFTER INSERT OR UPDATE OF status ON public.workflow_runs
  FOR EACH ROW EXECUTE FUNCTION public.notify_workflow_failure();

CREATE OR REPLACE FUNCTION public.notify_report_failure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  org_id uuid;
  owner_id uuid;
  report_name text;
  recipient uuid;
BEGIN
  IF NEW.status <> 'failed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  END IF;
  SELECT w.organization_id, w.owner_id INTO org_id, owner_id
    FROM public.workspaces w WHERE w.id = NEW.workspace_id;
  SELECT r.name INTO report_name FROM public.bi_reports r WHERE r.id = NEW.report_id;
  FOR recipient IN
    SELECT m.user_id FROM public.workspace_members m
      WHERE m.workspace_id = NEW.workspace_id AND m.status = 'active' AND m.role IN ('owner', 'admin')
    UNION SELECT NEW.actor_user_id WHERE NEW.actor_user_id IS NOT NULL
    UNION SELECT owner_id WHERE owner_id IS NOT NULL
  LOOP
    IF EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = NEW.workspace_id AND m.user_id = recipient AND m.status = 'active') THEN
      PERFORM public.emit_module_notification(
        recipient, org_id, 'report-failed:' || NEW.id::text, 'insights',
        'Report failed: ' || coalesce(report_name, 'Business insight'),
        'Open Insights to review the failed report run.',
        '/bi', jsonb_build_object('report_id', NEW.report_id, 'run_id', NEW.id, 'workspace_id', NEW.workspace_id)
      );
    END IF;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Report notification failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_report_failure() FROM PUBLIC;
CREATE TRIGGER report_failure_header_notification
  AFTER INSERT OR UPDATE OF status ON public.bi_report_runs
  FOR EACH ROW EXECUTE FUNCTION public.notify_report_failure();

CREATE OR REPLACE FUNCTION public.notify_webhook_dead_letter() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  endpoint_name text;
  recipient uuid;
BEGIN
  IF NEW.status <> 'dead_letter' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  END IF;
  SELECT e.name INTO endpoint_name FROM public.webhook_endpoints e
    WHERE e.id = NEW.endpoint_id AND e.organization_id = NEW.organization_id;
  FOR recipient IN
    SELECT m.user_id FROM public.organization_members m
      WHERE m.organization_id = NEW.organization_id AND m.role IN ('owner', 'admin')
    UNION SELECT o.owner_id FROM public.organizations o WHERE o.id = NEW.organization_id
  LOOP
    PERFORM public.emit_module_notification(
      recipient, NEW.organization_id, 'webhook-dead-letter:' || NEW.id::text, 'api_configuration',
      'Webhook delivery needs attention: ' || coalesce(endpoint_name, 'Endpoint'),
      'Delivery exhausted its retries. Review the endpoint and retry the event.',
      '/developer/webhooks',
      jsonb_build_object('endpoint_id', NEW.endpoint_id, 'delivery_id', NEW.id)
    );
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Webhook notification failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_webhook_dead_letter() FROM PUBLIC;
CREATE TRIGGER webhook_dead_letter_header_notification
  AFTER INSERT OR UPDATE OF status ON public.webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.notify_webhook_dead_letter();

CREATE OR REPLACE FUNCTION public.notify_api_key_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  recipient uuid;
  event_kind text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event_kind := 'created';
  ELSIF NEW.revoked_at IS NOT NULL AND OLD.revoked_at IS NULL THEN
    event_kind := 'revoked';
  ELSE
    RETURN NEW;
  END IF;
  FOR recipient IN
    SELECT m.user_id FROM public.organization_members m
      WHERE m.organization_id = NEW.organization_id AND m.role IN ('owner', 'admin')
    UNION SELECT o.owner_id FROM public.organizations o WHERE o.id = NEW.organization_id
  LOOP
    PERFORM public.emit_module_notification(
      recipient, NEW.organization_id, 'api-key:' || NEW.id::text || ':' || event_kind,
      'api_configuration', 'API key ' || event_kind || ': ' || NEW.name,
      'Review API access and permissions for this organization.', '/api-config/api',
      jsonb_build_object('api_key_id', NEW.id)
    );
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'API key notification failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_api_key_change() FROM PUBLIC;
CREATE TRIGGER api_key_header_notification
  AFTER INSERT OR UPDATE OF revoked_at ON public.api_keys
  FOR EACH ROW EXECUTE FUNCTION public.notify_api_key_change();

CREATE OR REPLACE FUNCTION public.notify_workspace_notification_setting() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  recipient uuid;
BEGIN
  IF NEW.notifications_enabled IS NOT DISTINCT FROM OLD.notifications_enabled THEN RETURN NEW; END IF;
  FOR recipient IN
    SELECT m.user_id FROM public.workspace_members m
      WHERE m.workspace_id = NEW.id AND m.status = 'active' AND m.role IN ('owner', 'admin')
    UNION SELECT NEW.owner_id
  LOOP
    PERFORM public.emit_module_notification(
      recipient, NEW.organization_id,
      'workspace-notifications:' || NEW.id::text || ':' || txid_current()::text,
      'settings', 'Workspace notifications ' || CASE WHEN NEW.notifications_enabled THEN 'enabled' ELSE 'disabled' END,
      'Notification delivery setting changed for ' || NEW.name || '.',
      '/settings/general', jsonb_build_object('workspace_id', NEW.id)
    );
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Workspace settings notification failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_workspace_notification_setting() FROM PUBLIC;
CREATE TRIGGER workspace_notification_setting_header_notification
  AFTER UPDATE OF notifications_enabled ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.notify_workspace_notification_setting();

CREATE OR REPLACE FUNCTION public.notify_campaign_outcome() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  org_id uuid;
BEGIN
  IF NEW.status NOT IN ('failed', 'completed') OR NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.created_by IS NULL OR NOT EXISTS (SELECT 1 FROM public.workspace_members m
    WHERE m.workspace_id = NEW.workspace_id AND m.user_id = NEW.created_by AND m.status = 'active') THEN
    RETURN NEW;
  END IF;
  SELECT w.organization_id INTO org_id FROM public.workspaces w WHERE w.id = NEW.workspace_id;
  PERFORM public.emit_module_notification(
    NEW.created_by, org_id, 'campaign:' || NEW.id::text || ':' || NEW.status::text,
    'marketing', 'Campaign ' || NEW.status::text || ': ' || NEW.name,
    CASE WHEN NEW.status = 'failed' THEN 'Review the campaign and its delivery results.'
      ELSE 'The campaign finished. Review its results.' END,
    '/campaigns/' || NEW.id::text,
    jsonb_build_object('campaign_id', NEW.id, 'workspace_id', NEW.workspace_id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Campaign notification failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_campaign_outcome() FROM PUBLIC;
CREATE TRIGGER campaign_outcome_header_notification
  AFTER UPDATE OF status ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.notify_campaign_outcome();

CREATE OR REPLACE FUNCTION public.notify_backup_warning() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  org_id uuid;
  recipient uuid;
BEGIN
  IF NEW.severity NOT IN ('warning', 'error') THEN RETURN NEW; END IF;
  SELECT w.organization_id INTO org_id FROM public.workspaces w WHERE w.id = NEW.workspace_id;
  FOR recipient IN
    SELECT m.user_id FROM public.workspace_members m
      WHERE m.workspace_id = NEW.workspace_id AND m.status = 'active' AND m.role IN ('owner', 'admin')
  LOOP
    PERFORM public.emit_module_notification(
      recipient, org_id, 'backup-warning:' || NEW.id::text, 'settings', NEW.title,
      left(coalesce(NEW.body, 'Review the backup status.'), 240),
      '/settings/data', jsonb_build_object('backup_notification_id', NEW.id, 'workspace_id', NEW.workspace_id)
    );
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Backup notification failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_backup_warning() FROM PUBLIC;
CREATE TRIGGER backup_warning_header_notification
  AFTER INSERT ON public.backup_notifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_backup_warning();

CREATE OR REPLACE FUNCTION public.notify_critical_billing_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  recipient uuid;
BEGIN
  IF NEW.kind::text NOT IN ('invoice.payment_failed', 'subscription.trial_ending', 'subscription.expired',
    'quota.approaching', 'quota.exceeded', 'usage.limit_reached') THEN RETURN NEW; END IF;
  FOR recipient IN
    SELECT m.user_id FROM public.organization_members m
      WHERE m.organization_id = NEW.organization_id AND m.role IN ('owner', 'admin', 'billing')
    UNION SELECT o.owner_id FROM public.organizations o WHERE o.id = NEW.organization_id
  LOOP
    PERFORM public.emit_module_notification(
      recipient, NEW.organization_id, 'billing-alert:' || NEW.id::text, 'platform',
      coalesce(NEW.subject, 'Billing needs attention'),
      left(coalesce(NEW.body, 'Review your billing settings.'), 240),
      '/settings/billing', jsonb_build_object('billing_notification_id', NEW.id)
    );
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Billing notification failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_critical_billing_event() FROM PUBLIC;
CREATE TRIGGER billing_critical_header_notification
  AFTER INSERT ON public.billing_notifications
  FOR EACH ROW EXECUTE FUNCTION public.notify_critical_billing_event();

-- Surface a bounded slice of existing actionable history when this migration lands.
-- Event keys keep repeated deployments or retried writes from duplicating rows.
WITH recent AS (
  SELECT r.*, row_number() OVER (PARTITION BY r.workspace_id ORDER BY r.started_at DESC) AS rn
  FROM public.workflow_runs r
  WHERE r.status = 'failed' AND r.started_at >= now() - interval '3 days'
)
SELECT public.emit_module_notification(
  m.user_id, w.organization_id, 'workflow-failed:' || r.id::text, 'automation',
  'Workflow failed: ' || a.name, 'Open the workflow to review the failed run.',
  '/automations/' || r.automation_id::text,
  jsonb_build_object('workflow_id', r.automation_id, 'run_id', r.id, 'workspace_id', r.workspace_id)
)
FROM recent r JOIN public.workspaces w ON w.id = r.workspace_id
JOIN public.automations a ON a.id = r.automation_id
JOIN public.workspace_members m ON m.workspace_id = r.workspace_id
  AND m.status = 'active' AND m.role IN ('owner', 'admin')
WHERE r.rn <= 20;

WITH recent AS (
  SELECT r.*, row_number() OVER (PARTITION BY r.workspace_id ORDER BY r.started_at DESC) AS rn
  FROM public.bi_report_runs r
  WHERE r.status = 'failed' AND r.started_at >= now() - interval '3 days'
)
SELECT public.emit_module_notification(
  m.user_id, w.organization_id, 'report-failed:' || r.id::text, 'insights',
  'Report failed: ' || coalesce(report.name, 'Business insight'),
  'Open Insights to review the failed report run.', '/bi',
  jsonb_build_object('report_id', r.report_id, 'run_id', r.id, 'workspace_id', r.workspace_id)
)
FROM recent r JOIN public.workspaces w ON w.id = r.workspace_id
JOIN public.workspace_members m ON m.workspace_id = r.workspace_id
  AND m.status = 'active' AND (m.role IN ('owner', 'admin') OR m.user_id = r.actor_user_id)
LEFT JOIN public.bi_reports report ON report.id = r.report_id
WHERE r.rn <= 20;

WITH recent AS (
  SELECT d.*, row_number() OVER (PARTITION BY d.organization_id ORDER BY d.created_at DESC) AS rn
  FROM public.webhook_deliveries d
  WHERE d.status = 'dead_letter' AND d.created_at >= now() - interval '3 days'
)
SELECT public.emit_module_notification(
  m.user_id, d.organization_id, 'webhook-dead-letter:' || d.id::text, 'api_configuration',
  'Webhook delivery needs attention: ' || e.name,
  'Delivery exhausted its retries. Review the endpoint and retry the event.',
  '/developer/webhooks', jsonb_build_object('endpoint_id', d.endpoint_id, 'delivery_id', d.id)
)
FROM recent d JOIN public.webhook_endpoints e ON e.id = d.endpoint_id
JOIN public.organization_members m ON m.organization_id = d.organization_id
  AND m.role IN ('owner', 'admin')
WHERE d.rn <= 20;

WITH recent AS (
  SELECT b.*, row_number() OVER (PARTITION BY b.workspace_id ORDER BY b.created_at DESC) AS rn
  FROM public.backup_notifications b
  WHERE b.severity IN ('warning', 'error') AND b.created_at >= now() - interval '3 days'
)
SELECT public.emit_module_notification(
  m.user_id, w.organization_id, 'backup-warning:' || b.id::text, 'settings',
  b.title, left(coalesce(b.body, 'Review the backup status.'), 240), '/settings/data',
  jsonb_build_object('backup_notification_id', b.id, 'workspace_id', b.workspace_id)
)
FROM recent b JOIN public.workspaces w ON w.id = b.workspace_id
JOIN public.workspace_members m ON m.workspace_id = b.workspace_id
  AND m.status = 'active' AND m.role IN ('owner', 'admin')
WHERE b.rn <= 20;

WITH recent AS (
  SELECT b.*, row_number() OVER (PARTITION BY b.organization_id ORDER BY b.created_at DESC) AS rn
  FROM public.billing_notifications b
  WHERE b.kind::text IN ('invoice.payment_failed', 'subscription.trial_ending', 'subscription.expired',
    'quota.approaching', 'quota.exceeded', 'usage.limit_reached')
    AND b.created_at >= now() - interval '3 days'
)
SELECT public.emit_module_notification(
  m.user_id, b.organization_id, 'billing-alert:' || b.id::text, 'platform',
  coalesce(b.subject, 'Billing needs attention'),
  left(coalesce(b.body, 'Review your billing settings.'), 240), '/settings/billing',
  jsonb_build_object('billing_notification_id', b.id)
)
FROM recent b JOIN public.organization_members m ON m.organization_id = b.organization_id
  AND m.role IN ('owner', 'admin', 'billing')
WHERE b.rn <= 20;
