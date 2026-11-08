-- ============================================================================
-- Phase 8 — Sales CRM Architecture: Products/Services, Quotes, Invoices,
-- Payments, Sales Goals, Forecasting. Multi-tenant, RLS, realtime, AI-ready.
-- ============================================================================

-- ---------- ENUMS ----------
DO $$ BEGIN CREATE TYPE public.product_kind AS ENUM ('product','service','subscription','bundle'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.quote_status AS ENUM ('draft','sent','viewed','accepted','rejected','expired','revised'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.invoice_status AS ENUM ('draft','sent','viewed','partial','paid','overdue','void','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_status AS ENUM ('pending','succeeded','failed','refunded','partially_refunded','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_method AS ENUM ('cash','bank_transfer','card','stripe','paypal','crypto','check','other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.goal_period AS ENUM ('daily','weekly','monthly','quarterly','yearly'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.goal_metric AS ENUM ('revenue','deals_won','deals_created','activities','calls','meetings','custom'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- PRODUCTS / SERVICES ----------
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind public.product_kind NOT NULL DEFAULT 'product',
  sku text,
  name text NOT NULL,
  description text,
  category text,
  unit text DEFAULT 'unit',
  price numeric(18,4) NOT NULL DEFAULT 0,
  cost numeric(18,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  billing_interval text CHECK (billing_interval IN ('one_time','daily','weekly','monthly','quarterly','yearly') OR billing_interval IS NULL),
  is_active boolean NOT NULL DEFAULT true,
  is_taxable boolean NOT NULL DEFAULT true,
  track_inventory boolean NOT NULL DEFAULT false,
  stock_quantity numeric(18,3),
  image_url text,
  tags text[] DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, sku)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS products_ws_idx ON public.products(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS products_kind_idx ON public.products(workspace_id, kind) WHERE deleted_at IS NULL AND is_active;
CREATE INDEX IF NOT EXISTS products_name_trgm ON public.products USING gin (name gin_trgm_ops);
CREATE POLICY products_select ON public.products FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY products_insert ON public.products FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY products_update ON public.products FOR UPDATE USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY products_delete ON public.products FOR DELETE USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- DEAL LINE ITEMS (products attached to deals) ----------
CREATE TABLE IF NOT EXISTS public.deal_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  quantity numeric(18,3) NOT NULL DEFAULT 1,
  unit_price numeric(18,4) NOT NULL DEFAULT 0,
  discount_pct numeric(6,3) NOT NULL DEFAULT 0,
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  subtotal numeric(18,4) NOT NULL DEFAULT 0,
  total numeric(18,4) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_line_items TO authenticated;
GRANT ALL ON public.deal_line_items TO service_role;
ALTER TABLE public.deal_line_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS deal_line_items_deal_idx ON public.deal_line_items(deal_id);
CREATE POLICY dli_select ON public.deal_line_items FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY dli_write ON public.deal_line_items FOR ALL USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER dli_updated_at BEFORE UPDATE ON public.deal_line_items FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- QUOTES ----------
CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  quote_number text NOT NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  status public.quote_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(18,4) NOT NULL DEFAULT 0,
  discount_total numeric(18,4) NOT NULL DEFAULT 0,
  tax_total numeric(18,4) NOT NULL DEFAULT 0,
  total numeric(18,4) NOT NULL DEFAULT 0,
  valid_until date,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  terms text,
  notes text,
  public_token text UNIQUE,
  version int NOT NULL DEFAULT 1,
  parent_quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, quote_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS quotes_ws_idx ON public.quotes(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quotes_status_idx ON public.quotes(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quotes_deal_idx ON public.quotes(deal_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS quotes_contact_idx ON public.quotes(contact_id) WHERE deleted_at IS NULL;
CREATE POLICY quotes_select ON public.quotes FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY quotes_insert ON public.quotes FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY quotes_update ON public.quotes FOR UPDATE USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY quotes_delete ON public.quotes FOR DELETE USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));
CREATE TRIGGER quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.quote_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL, description text,
  quantity numeric(18,3) NOT NULL DEFAULT 1,
  unit_price numeric(18,4) NOT NULL DEFAULT 0,
  discount_pct numeric(6,3) NOT NULL DEFAULT 0,
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  subtotal numeric(18,4) NOT NULL DEFAULT 0,
  total numeric(18,4) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_line_items TO authenticated;
GRANT ALL ON public.quote_line_items TO service_role;
ALTER TABLE public.quote_line_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS qli_quote_idx ON public.quote_line_items(quote_id);
CREATE POLICY qli_select ON public.quote_line_items FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY qli_write ON public.quote_line_items FOR ALL USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER qli_updated_at BEFORE UPDATE ON public.quote_line_items FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- INVOICES ----------
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'USD',
  subtotal numeric(18,4) NOT NULL DEFAULT 0,
  discount_total numeric(18,4) NOT NULL DEFAULT 0,
  tax_total numeric(18,4) NOT NULL DEFAULT 0,
  total numeric(18,4) NOT NULL DEFAULT 0,
  amount_paid numeric(18,4) NOT NULL DEFAULT 0,
  amount_due numeric(18,4) NOT NULL DEFAULT 0,
  issue_date date NOT NULL DEFAULT current_date,
  due_date date,
  sent_at timestamptz, viewed_at timestamptz, paid_at timestamptz, voided_at timestamptz,
  billing_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  terms text, notes text,
  public_token text UNIQUE,
  external_ref text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, invoice_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS invoices_ws_idx ON public.invoices(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_status_idx ON public.invoices(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_due_idx ON public.invoices(workspace_id, due_date) WHERE deleted_at IS NULL AND status IN ('sent','viewed','partial','overdue');
CREATE INDEX IF NOT EXISTS invoices_contact_idx ON public.invoices(contact_id) WHERE deleted_at IS NULL;
CREATE POLICY invoices_select ON public.invoices FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY invoices_insert ON public.invoices FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY invoices_update ON public.invoices FOR UPDATE USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY invoices_delete ON public.invoices FOR DELETE USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL, description text,
  quantity numeric(18,3) NOT NULL DEFAULT 1,
  unit_price numeric(18,4) NOT NULL DEFAULT 0,
  discount_pct numeric(6,3) NOT NULL DEFAULT 0,
  tax_rate numeric(6,3) NOT NULL DEFAULT 0,
  subtotal numeric(18,4) NOT NULL DEFAULT 0,
  total numeric(18,4) NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_line_items TO authenticated;
GRANT ALL ON public.invoice_line_items TO service_role;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ili_invoice_idx ON public.invoice_line_items(invoice_id);
CREATE POLICY ili_select ON public.invoice_line_items FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY ili_write ON public.invoice_line_items FOR ALL USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER ili_updated_at BEFORE UPDATE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- PAYMENTS ----------
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  amount numeric(18,4) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  method public.payment_method NOT NULL DEFAULT 'other',
  status public.payment_status NOT NULL DEFAULT 'pending',
  processor text,
  processor_ref text,
  paid_at timestamptz,
  reference text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS payments_ws_idx ON public.payments(workspace_id);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_deal_idx ON public.payments(deal_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments(workspace_id, status);
CREATE POLICY payments_select ON public.payments FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY payments_insert ON public.payments FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY payments_update ON public.payments FOR UPDATE USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY payments_delete ON public.payments FOR DELETE USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- SALES GOALS ----------
CREATE TABLE IF NOT EXISTS public.sales_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  metric public.goal_metric NOT NULL,
  period public.goal_period NOT NULL DEFAULT 'monthly',
  target_amount numeric(18,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  scope text NOT NULL DEFAULT 'workspace' CHECK (scope IN ('workspace','team','user','pipeline')),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.deal_pipelines(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_goals TO authenticated;
GRANT ALL ON public.sales_goals TO service_role;
ALTER TABLE public.sales_goals ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS goals_ws_idx ON public.sales_goals(workspace_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS goals_user_idx ON public.sales_goals(user_id) WHERE is_active;
CREATE POLICY goals_select ON public.sales_goals FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY goals_write ON public.sales_goals FOR ALL
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));
CREATE TRIGGER goals_updated_at BEFORE UPDATE ON public.sales_goals FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- REVENUE FORECASTS (snapshot cache) ----------
CREATE TABLE IF NOT EXISTS public.revenue_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.deal_pipelines(id) ON DELETE CASCADE,
  period public.goal_period NOT NULL DEFAULT 'monthly',
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  best_case numeric(18,4) NOT NULL DEFAULT 0,
  commit_case numeric(18,4) NOT NULL DEFAULT 0,
  worst_case numeric(18,4) NOT NULL DEFAULT 0,
  weighted numeric(18,4) NOT NULL DEFAULT 0,
  closed_won numeric(18,4) NOT NULL DEFAULT 0,
  open_deals_count int NOT NULL DEFAULT 0,
  ai_confidence numeric(5,2),
  ai_summary text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, pipeline_id, period, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_forecasts TO authenticated;
GRANT ALL ON public.revenue_forecasts TO service_role;
ALTER TABLE public.revenue_forecasts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS forecasts_ws_idx ON public.revenue_forecasts(workspace_id, period_start DESC);
CREATE POLICY forecasts_select ON public.revenue_forecasts FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY forecasts_write ON public.revenue_forecasts FOR ALL
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));

-- ---------- NUMBER SEQUENCES (quote/invoice numbering) ----------
CREATE TABLE IF NOT EXISTS public.document_sequences (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('quote','invoice')),
  prefix text NOT NULL DEFAULT '',
  next_value bigint NOT NULL DEFAULT 1,
  pad_width int NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_sequences TO authenticated;
GRANT ALL ON public.document_sequences TO service_role;
ALTER TABLE public.document_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY docseq_select ON public.document_sequences FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY docseq_write ON public.document_sequences FOR ALL
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));

CREATE OR REPLACE FUNCTION public.next_document_number(_ws uuid, _kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _prefix text; _n bigint; _pad int; _default_prefix text;
BEGIN
  IF NOT public.is_workspace_member(_ws, auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  _default_prefix := CASE WHEN _kind = 'quote' THEN 'Q-' ELSE 'INV-' END;
  INSERT INTO public.document_sequences(workspace_id, kind, prefix, next_value)
    VALUES (_ws, _kind, _default_prefix, 1)
    ON CONFLICT (workspace_id, kind) DO NOTHING;
  UPDATE public.document_sequences
     SET next_value = next_value + 1, updated_at = now()
   WHERE workspace_id = _ws AND kind = _kind
   RETURNING next_value - 1, prefix, pad_width INTO _n, _prefix, _pad;
  RETURN _prefix || lpad(_n::text, _pad, '0');
END $$;

-- ---------- LINE-ITEM RECALC TRIGGERS ----------
CREATE OR REPLACE FUNCTION public.tg_line_item_recalc()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _sub numeric(18,4); _disc numeric(18,4); _tot numeric(18,4);
BEGIN
  _sub := COALESCE(NEW.quantity,0) * COALESCE(NEW.unit_price,0);
  _disc := _sub * (COALESCE(NEW.discount_pct,0)/100.0);
  _tot := (_sub - _disc) * (1 + COALESCE(NEW.tax_rate,0)/100.0);
  NEW.subtotal := _sub;
  NEW.total := _tot;
  RETURN NEW;
END $$;

CREATE TRIGGER qli_recalc BEFORE INSERT OR UPDATE ON public.quote_line_items FOR EACH ROW EXECUTE FUNCTION public.tg_line_item_recalc();
CREATE TRIGGER ili_recalc BEFORE INSERT OR UPDATE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.tg_line_item_recalc();
CREATE TRIGGER dli_recalc BEFORE INSERT OR UPDATE ON public.deal_line_items FOR EACH ROW EXECUTE FUNCTION public.tg_line_item_recalc();

-- Aggregate parent totals when line items change
CREATE OR REPLACE FUNCTION public.tg_aggregate_parent_totals()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _table text := TG_ARGV[0];
  _pid uuid;
  _sub numeric(18,4) := 0; _disc numeric(18,4) := 0; _tax numeric(18,4) := 0; _tot numeric(18,4) := 0;
BEGIN
  _pid := COALESCE((to_jsonb(NEW)->>(_table||'_id'))::uuid, (to_jsonb(OLD)->>(_table||'_id'))::uuid);
  IF _pid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF _table = 'quote' THEN
    SELECT COALESCE(SUM(subtotal),0),
           COALESCE(SUM(subtotal * discount_pct/100.0),0),
           COALESCE(SUM((subtotal - subtotal*discount_pct/100.0) * tax_rate/100.0),0),
           COALESCE(SUM(total),0)
      INTO _sub, _disc, _tax, _tot
      FROM public.quote_line_items WHERE quote_id = _pid;
    UPDATE public.quotes
       SET subtotal=_sub, discount_total=_disc, tax_total=_tax, total=_tot, updated_at=now()
     WHERE id = _pid;
  ELSIF _table = 'invoice' THEN
    SELECT COALESCE(SUM(subtotal),0),
           COALESCE(SUM(subtotal * discount_pct/100.0),0),
           COALESCE(SUM((subtotal - subtotal*discount_pct/100.0) * tax_rate/100.0),0),
           COALESCE(SUM(total),0)
      INTO _sub, _disc, _tax, _tot
      FROM public.invoice_line_items WHERE invoice_id = _pid;
    UPDATE public.invoices
       SET subtotal=_sub, discount_total=_disc, tax_total=_tax, total=_tot,
           amount_due = GREATEST(_tot - amount_paid, 0), updated_at=now()
     WHERE id = _pid;
  ELSIF _table = 'deal' THEN
    SELECT COALESCE(SUM(total),0) INTO _tot FROM public.deal_line_items WHERE deal_id = _pid;
    UPDATE public.deals SET amount = _tot, updated_at = now() WHERE id = _pid;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER qli_aggregate AFTER INSERT OR UPDATE OR DELETE ON public.quote_line_items FOR EACH ROW EXECUTE FUNCTION public.tg_aggregate_parent_totals('quote');
CREATE TRIGGER ili_aggregate AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items FOR EACH ROW EXECUTE FUNCTION public.tg_aggregate_parent_totals('invoice');
CREATE TRIGGER dli_aggregate AFTER INSERT OR UPDATE OR DELETE ON public.deal_line_items FOR EACH ROW EXECUTE FUNCTION public.tg_aggregate_parent_totals('deal');

-- Payment → invoice status sync
CREATE OR REPLACE FUNCTION public.tg_payment_sync_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _iid uuid; _paid numeric(18,4); _total numeric(18,4);
BEGIN
  _iid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF _iid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(SUM(amount),0) INTO _paid FROM public.payments
    WHERE invoice_id = _iid AND status = 'succeeded';
  SELECT total INTO _total FROM public.invoices WHERE id = _iid;
  UPDATE public.invoices
     SET amount_paid = _paid,
         amount_due = GREATEST(_total - _paid, 0),
         status = CASE
           WHEN _paid >= _total AND _total > 0 THEN 'paid'::invoice_status
           WHEN _paid > 0 AND _paid < _total THEN 'partial'::invoice_status
           WHEN due_date IS NOT NULL AND due_date < current_date AND _paid < _total THEN 'overdue'::invoice_status
           ELSE status
         END,
         paid_at = CASE WHEN _paid >= _total AND _total > 0 THEN COALESCE(paid_at, now()) ELSE paid_at END,
         updated_at = now()
   WHERE id = _iid;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE TRIGGER payments_sync_invoice AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_payment_sync_invoice();

-- Audit triggers on new CRM tables
CREATE TRIGGER audit_products AFTER INSERT OR UPDATE OR DELETE ON public.products FOR EACH ROW EXECUTE FUNCTION public.tg_crm_audit('product');
CREATE TRIGGER audit_quotes AFTER INSERT OR UPDATE OR DELETE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.tg_crm_audit('quote');
CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.tg_crm_audit('invoice');
CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.tg_crm_audit('payment');

-- Activity logs
CREATE TRIGGER activity_quotes AFTER INSERT OR UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.tg_activity_log_entity('quote');
CREATE TRIGGER activity_invoices AFTER INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.tg_activity_log_entity('invoice');

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE
    public.products, public.quotes, public.quote_line_items,
    public.invoices, public.invoice_line_items, public.payments,
    public.deal_line_items, public.sales_goals, public.revenue_forecasts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
