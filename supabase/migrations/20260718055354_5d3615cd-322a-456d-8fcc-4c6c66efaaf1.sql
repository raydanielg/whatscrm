
CREATE TYPE billing_document_type AS ENUM ('invoice','credit_note','receipt','refund_receipt');
CREATE TYPE billing_document_status AS ENUM ('draft','issued','sent','paid','void','refunded');

CREATE TABLE public.billing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type billing_document_type NOT NULL,
  status billing_document_status NOT NULL DEFAULT 'draft',
  number text NOT NULL,
  invoice_id uuid REFERENCES public.billing_invoices(id) ON DELETE SET NULL,
  parent_document_id uuid REFERENCES public.billing_documents(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  customer_name text,
  customer_email text,
  customer_address jsonb,
  customer_tax_id text,
  currency text NOT NULL DEFAULT 'USD',
  locale text NOT NULL DEFAULT 'en-US',
  subtotal_cents integer NOT NULL DEFAULT 0,
  discount_cents integer NOT NULL DEFAULT 0,
  tax_cents integer NOT NULL DEFAULT 0,
  total_cents integer NOT NULL DEFAULT 0,
  amount_paid_cents integer NOT NULL DEFAULT 0,
  amount_refunded_cents integer NOT NULL DEFAULT 0,
  tax_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  template_id uuid,
  issued_at timestamptz,
  due_at timestamptz,
  sent_at timestamptz,
  pdf_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, number)
);
CREATE INDEX idx_billing_documents_org ON public.billing_documents(organization_id, type, created_at DESC);
CREATE INDEX idx_billing_documents_invoice ON public.billing_documents(invoice_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_documents TO authenticated;
GRANT ALL ON public.billing_documents TO service_role;
ALTER TABLE public.billing_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read documents" ON public.billing_documents FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org members insert documents" ON public.billing_documents FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org members update documents" ON public.billing_documents FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org members delete documents" ON public.billing_documents FOR DELETE TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE TABLE public.billing_document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  document_type billing_document_type NOT NULL DEFAULT 'invoice',
  company_name text,
  company_logo_url text,
  company_address jsonb,
  company_tax_id text,
  company_email text,
  company_phone text,
  company_website text,
  primary_color text DEFAULT '#0066FF',
  accent_color text DEFAULT '#0A0A0A',
  font_family text DEFAULT 'Inter',
  footer_note text,
  terms text,
  number_prefix text DEFAULT 'INV-',
  number_padding integer DEFAULT 5,
  next_number integer DEFAULT 1,
  locale text DEFAULT 'en-US',
  currency text DEFAULT 'USD',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_doc_templates_org ON public.billing_document_templates(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_document_templates TO authenticated;
GRANT ALL ON public.billing_document_templates TO service_role;
ALTER TABLE public.billing_document_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage templates" ON public.billing_document_templates FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE TABLE public.billing_document_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.billing_documents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_doc_history_doc ON public.billing_document_history(document_id, created_at DESC);
GRANT SELECT, INSERT ON public.billing_document_history TO authenticated;
GRANT ALL ON public.billing_document_history TO service_role;
ALTER TABLE public.billing_document_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read history" ON public.billing_document_history FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org members insert history" ON public.billing_document_history FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE TABLE public.billing_tax_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.billing_customers(id) ON DELETE CASCADE,
  reason text NOT NULL,
  certificate_url text,
  country text,
  region text,
  valid_from date,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_tax_exemptions TO authenticated;
GRANT ALL ON public.billing_tax_exemptions TO service_role;
ALTER TABLE public.billing_tax_exemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members manage exemptions" ON public.billing_tax_exemptions FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.next_document_number(_template_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _prefix text; _padding integer; _next integer;
BEGIN
  UPDATE public.billing_document_templates
  SET next_number = next_number + 1, updated_at = now()
  WHERE id = _template_id
  RETURNING number_prefix, number_padding, next_number - 1 INTO _prefix, _padding, _next;
  RETURN _prefix || lpad(_next::text, COALESCE(_padding, 5), '0');
END $$;
