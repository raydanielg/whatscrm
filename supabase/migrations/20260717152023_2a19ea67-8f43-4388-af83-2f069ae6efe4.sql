
CREATE TABLE IF NOT EXISTS public.contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'static' CHECK (type IN ('static','dynamic')),
  segment_id uuid REFERENCES public.customer_segments(id) ON DELETE SET NULL,
  color text,
  icon text,
  member_count integer NOT NULL DEFAULT 0,
  last_computed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_lists TO authenticated;
GRANT ALL ON public.contact_lists TO service_role;
ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_lists ws access" ON public.contact_lists FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS contact_lists_ws_idx ON public.contact_lists(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.contact_list_members (
  list_id uuid NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (list_id, contact_id)
);
GRANT SELECT, INSERT, DELETE ON public.contact_list_members TO authenticated;
GRANT ALL ON public.contact_list_members TO service_role;
ALTER TABLE public.contact_list_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contact_list_members ws access" ON public.contact_list_members FOR ALL TO authenticated
  USING (list_id IN (SELECT id FROM public.contact_lists WHERE workspace_id IN
    (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())))
  WITH CHECK (list_id IN (SELECT id FROM public.contact_lists WHERE workspace_id IN
    (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())));
CREATE INDEX IF NOT EXISTS contact_list_members_contact_idx ON public.contact_list_members(contact_id);

CREATE TABLE IF NOT EXISTS public.campaign_ab_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  weight numeric NOT NULL DEFAULT 50 CHECK (weight >= 0 AND weight <= 100),
  message_body text,
  media_url text,
  template_id uuid,
  template_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_winner boolean NOT NULL DEFAULT false,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  clicked_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_ab_variants TO authenticated;
GRANT ALL ON public.campaign_ab_variants TO service_role;
ALTER TABLE public.campaign_ab_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ab_variants ws access" ON public.campaign_ab_variants FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS ab_variants_campaign_idx ON public.campaign_ab_variants(campaign_id);

CREATE TABLE IF NOT EXISTS public.campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text,
  channel text NOT NULL DEFAULT 'whatsapp',
  message_body text,
  media_url text,
  wa_template_id uuid,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  is_shared boolean NOT NULL DEFAULT true,
  usage_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_templates TO authenticated;
GRANT ALL ON public.campaign_templates TO service_role;
ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_templates ws access" ON public.campaign_templates FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS campaign_templates_ws_idx ON public.campaign_templates(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.campaign_dispatch_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.campaign_ab_variants(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  phone_number text,
  message_body text,
  media_url text,
  template_id uuid,
  template_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority smallint NOT NULL DEFAULT 5,
  run_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','skipped','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_dispatch_queue TO authenticated;
GRANT ALL ON public.campaign_dispatch_queue TO service_role;
ALTER TABLE public.campaign_dispatch_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dispatch_queue ws access" ON public.campaign_dispatch_queue FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE INDEX IF NOT EXISTS dispatch_queue_due_idx
  ON public.campaign_dispatch_queue(status, run_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS dispatch_queue_campaign_idx ON public.campaign_dispatch_queue(campaign_id, status);

ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_lists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.contact_list_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_ab_variants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_dispatch_queue;
