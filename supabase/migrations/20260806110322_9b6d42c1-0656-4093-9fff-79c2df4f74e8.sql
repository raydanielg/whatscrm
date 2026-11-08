CREATE TABLE public.marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  work_email text NOT NULL,
  company_size text NOT NULL,
  contact_method text NOT NULL DEFAULT 'email',
  whatsapp_number text,
  message text,
  source_page text,
  referrer text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_leads_contact_method_check CHECK (contact_method IN ('email','whatsapp')),
  CONSTRAINT marketing_leads_status_check CHECK (status IN ('new','contacted','qualified','archived','spam'))
);

CREATE INDEX marketing_leads_created_at_idx ON public.marketing_leads (created_at DESC);
CREATE INDEX marketing_leads_work_email_idx ON public.marketing_leads (lower(work_email));

GRANT SELECT, UPDATE, DELETE ON public.marketing_leads TO authenticated;
GRANT ALL ON public.marketing_leads TO service_role;

ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read marketing leads"
  ON public.marketing_leads FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can update marketing leads"
  ON public.marketing_leads FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can delete marketing leads"
  ON public.marketing_leads FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE TRIGGER update_marketing_leads_updated_at
  BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();