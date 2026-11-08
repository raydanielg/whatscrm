CREATE TABLE public.booking_notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_type_id uuid REFERENCES public.booking_event_types(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('confirmation','reschedule','cancellation','reminder','follow_up','review_request')),
  channel text NOT NULL CHECK (channel IN ('whatsapp','email','sms','push','in_app')),
  subject text,
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_notif_tpl_lookup_idx
  ON public.booking_notification_templates (workspace_id, event_type_id, kind, channel)
  WHERE is_active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_notification_templates TO authenticated;
GRANT ALL ON public.booking_notification_templates TO service_role;
ALTER TABLE public.booking_notification_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members manage notification templates"
  ON public.booking_notification_templates FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TABLE public.booking_notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_type_id uuid REFERENCES public.booking_event_types(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('confirmation','reschedule','cancellation','reminder','follow_up','review_request')),
  channels text[] NOT NULL DEFAULT ARRAY['email']::text[],
  offset_minutes integer NOT NULL DEFAULT 0,
  send_to text NOT NULL DEFAULT 'customer' CHECK (send_to IN ('customer','host','both')),
  is_active boolean NOT NULL DEFAULT true,
  template_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_notif_rules_lookup_idx
  ON public.booking_notification_rules (workspace_id, kind, is_active);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_notification_rules TO authenticated;
GRANT ALL ON public.booking_notification_rules TO service_role;
ALTER TABLE public.booking_notification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members manage notification rules"
  ON public.booking_notification_rules FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

ALTER TABLE public.booking_reminders
  ADD COLUMN IF NOT EXISTS rule_id uuid REFERENCES public.booking_notification_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'reminder',
  ADD COLUMN IF NOT EXISTS recipient text NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.booking_notification_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rendered_subject text,
  ADD COLUMN IF NOT EXISTS rendered_body text;

CREATE TABLE public.booking_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid,
  contact_id uuid,
  endpoint text NOT NULL UNIQUE,
  keys jsonb NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_push_subscriptions TO authenticated;
GRANT ALL ON public.booking_push_subscriptions TO service_role;
ALTER TABLE public.booking_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace members manage push subs"
  ON public.booking_push_subscriptions FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_notification_rules;
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_notification_templates;