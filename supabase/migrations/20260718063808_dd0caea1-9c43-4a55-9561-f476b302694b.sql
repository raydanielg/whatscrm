CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','success','warning','critical')),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','admins','owners','trial','paid')),
  cta_label text,
  cta_url text,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_announcements TO authenticated;
GRANT ALL ON public.platform_announcements TO service_role;
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone reads published announcements"
  ON public.platform_announcements FOR SELECT TO authenticated
  USING ((published_at IS NOT NULL AND (expires_at IS NULL OR expires_at > now())) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins manage announcements"
  ON public.platform_announcements FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_platform_announcements_updated_at
  BEFORE UPDATE ON public.platform_announcements
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.platform_support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  requester_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subject text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general','billing','technical','abuse','feature_request','bug')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','in_progress','resolved','closed')),
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_response_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.platform_support_tickets TO authenticated;
GRANT ALL ON public.platform_support_tickets TO service_role;
ALTER TABLE public.platform_support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requester or platform staff read tickets"
  ON public.platform_support_tickets FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('superadmin','support'))
  );

CREATE POLICY "Users open tickets"
  ON public.platform_support_tickets FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Platform staff update tickets"
  ON public.platform_support_tickets FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('superadmin','support')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('superadmin','support')));

CREATE TRIGGER trg_platform_support_tickets_updated_at
  BEFORE UPDATE ON public.platform_support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.platform_support_tickets(status, priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_org ON public.platform_support_tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_announcements_published ON public.platform_announcements(published_at DESC) WHERE published_at IS NOT NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_support_tickets;