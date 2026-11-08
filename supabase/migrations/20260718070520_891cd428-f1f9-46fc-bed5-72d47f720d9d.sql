
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

ALTER TABLE public.platform_announcements
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'announcement',
  ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS starts_at timestamptz;

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.platform_support_tickets(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage support messages" ON public.support_ticket_messages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'superadmin'::app_role) OR public.has_role(auth.uid(),'support'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'superadmin'::app_role) OR public.has_role(auth.uid(),'support'::app_role));
CREATE POLICY "requester reads own ticket messages" ON public.support_ticket_messages FOR SELECT TO authenticated
  USING (NOT is_internal AND EXISTS (SELECT 1 FROM public.platform_support_tickets t WHERE t.id = ticket_id AND t.requester_id = auth.uid()));
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON public.support_ticket_messages(ticket_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.release_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL DEFAULT 'improvement',
  translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.release_notes TO anon, authenticated;
GRANT ALL ON public.release_notes TO service_role;
ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "published release notes readable" ON public.release_notes FOR SELECT
  USING (published_at IS NOT NULL AND published_at <= now());
CREATE POLICY "staff manage release notes" ON public.release_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'superadmin'::app_role) OR public.has_role(auth.uid(),'support'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'superadmin'::app_role) OR public.has_role(auth.uid(),'support'::app_role));

CREATE TABLE IF NOT EXISTS public.system_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  channel text NOT NULL DEFAULT 'in_app',
  subject text,
  body text NOT NULL,
  translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_message_templates TO authenticated;
GRANT ALL ON public.system_message_templates TO service_role;
ALTER TABLE public.system_message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff manage system templates" ON public.system_message_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'superadmin'::app_role) OR public.has_role(auth.uid(),'support'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'superadmin'::app_role) OR public.has_role(auth.uid(),'support'::app_role));

ALTER TABLE public.kb_articles ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb;
