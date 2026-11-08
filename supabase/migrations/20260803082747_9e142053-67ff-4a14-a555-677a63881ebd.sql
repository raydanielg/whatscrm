ALTER POLICY "profiles select own or same-workspace" ON public.profiles RENAME TO "profiles select own";

CREATE OR REPLACE FUNCTION public.realtime_topic_allowed(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _prefix text;
  _id uuid;
  _kind text;
  _ws uuid;
BEGIN
  IF _uid IS NULL OR _topic IS NULL OR btrim(_topic) = '' THEN
    RETURN false;
  END IF;

  IF public.is_super_admin(_uid) THEN
    RETURN true;
  END IF;

  _prefix := substring(_topic from '^([a-zA-Z0-9_-]+?)[:-][0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?::[A-Za-z0-9_.-]+)*$');
  IF _prefix IS NULL THEN
    RETURN false;
  END IF;

  _id := (substring(_topic from '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})'))::uuid;

  _kind := CASE _prefix
    WHEN 'ws' THEN 'workspace'
    WHEN 'ws-presence' THEN 'workspace'
    WHEN 'ws-msgs' THEN 'workspace'
    WHEN 'ws-conv' THEN 'workspace'
    WHEN 'ws-livechat' THEN 'workspace'
    WHEN 'ws-accounts' THEN 'workspace'
    WHEN 'ai-sug' THEN 'workspace'
    WHEN 'assignment-rules' THEN 'workspace'
    WHEN 'auto-invite' THEN 'workspace'
    WHEN 'audience' THEN 'workspace'
    WHEN 'bi' THEN 'workspace'
    WHEN 'bi-exec' THEN 'workspace'
    WHEN 'bi-whatsapp' THEN 'workspace'
    WHEN 'commerce-analytics' THEN 'workspace'
    WHEN 'companies' THEN 'workspace'
    WHEN 'consent' THEN 'workspace'
    WHEN 'contacts' THEN 'workspace'
    WHEN 'customers' THEN 'workspace'
    WHEN 'dashboard' THEN 'workspace'
    WHEN 'forecast-deals' THEN 'workspace'
    WHEN 'forecast-goals' THEN 'workspace'
    WHEN 'helpdesk-analytics-live' THEN 'workspace'
    WHEN 'leads' THEN 'workspace'
    WHEN 'marketing' THEN 'workspace'
    WHEN 'marketing-extras' THEN 'workspace'
    WHEN 'message-templates' THEN 'workspace'
    WHEN 'monitoring' THEN 'workspace'
    WHEN 'omni-analytics' THEN 'workspace'
    WHEN 'pipeline_rt' THEN 'workspace'
    WHEN 'sales-crm' THEN 'workspace'
    WHEN 'sales_activities' THEN 'workspace'
    WHEN 'sched' THEN 'workspace'
    WHEN 'scheduled-messages' THEN 'workspace'
    WHEN 'sla-policies' THEN 'workspace'
    WHEN 'sync-cursors' THEN 'workspace'
    WHEN 'sync-jobs' THEN 'workspace'
    WHEN 'theme-sync' THEN 'workspace'
    WHEN 'timeline' THEN 'workspace'
    WHEN 'workflows-list' THEN 'workspace'
    WHEN 'org-status' THEN 'org'
    WHEN 'usage' THEN 'org'
    WHEN 'tenant-detail' THEN 'org'
    WHEN 'conv-activity' THEN 'conversation'
    WHEN 'conv-intel' THEN 'conversation'
    WHEN 'conv-notes' THEN 'conversation'
    WHEN 'conv-participants' THEN 'conversation'
    WHEN 'conv-sla' THEN 'conversation'
    WHEN 'portal-conv' THEN 'conversation'
    WHEN 'portal-widget' THEN 'conversation'
    WHEN 'portal-ticket' THEN 'conversation'
    WHEN 'contact' THEN 'contact'
    WHEN 'contact-activity' THEN 'contact'
    WHEN 'portal-dashboard' THEN 'contact'
    WHEN 'company-detail' THEN 'company'
    WHEN 'lead-q' THEN 'lead'
    WHEN 'bot-analytics' THEN 'chatbot'
    WHEN 'notifications' THEN 'self'
    ELSE NULL
  END;

  IF _kind IS NULL THEN
    RETURN false;
  END IF;

  IF _kind = 'self' THEN
    RETURN _id = _uid;
  END IF;

  IF _kind = 'workspace' THEN
    RETURN public.is_workspace_member(_id, _uid);
  END IF;

  IF _kind = 'org' THEN
    RETURN public.is_org_member(_id, _uid);
  END IF;

  IF _kind = 'conversation' THEN
    SELECT c.workspace_id INTO _ws FROM public.conversations c WHERE c.id = _id;
  ELSIF _kind = 'contact' THEN
    SELECT c.workspace_id INTO _ws FROM public.contacts c WHERE c.id = _id;
  ELSIF _kind = 'company' THEN
    SELECT c.workspace_id INTO _ws FROM public.companies c WHERE c.id = _id;
  ELSIF _kind = 'lead' THEN
    SELECT l.workspace_id INTO _ws FROM public.leads l WHERE l.id = _id;
  ELSIF _kind = 'chatbot' THEN
    SELECT b.workspace_id INTO _ws FROM public.chatbots b WHERE b.id = _id;
  END IF;

  IF _ws IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.is_workspace_member(_ws, _uid);
END;
$function$;