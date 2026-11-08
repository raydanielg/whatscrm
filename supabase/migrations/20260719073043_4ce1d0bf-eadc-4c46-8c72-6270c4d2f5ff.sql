
-- Phase 22: Conversational Commerce
CREATE TABLE public.commerce_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel TEXT,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_carts TO authenticated;
GRANT ALL ON public.commerce_carts TO service_role;
ALTER TABLE public.commerce_carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cart workspace access" ON public.commerce_carts FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TABLE public.commerce_cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES public.commerce_carts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_cart_items TO authenticated;
GRANT ALL ON public.commerce_cart_items TO service_role;
ALTER TABLE public.commerce_cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cart items via cart" ON public.commerce_cart_items FOR ALL TO authenticated
  USING (cart_id IN (SELECT id FROM public.commerce_carts WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())))
  WITH CHECK (cart_id IN (SELECT id FROM public.commerce_carts WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())));

CREATE TABLE public.commerce_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  order_number TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  cart_id UUID REFERENCES public.commerce_carts(id) ON DELETE SET NULL,
  channel TEXT,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  fulfillment_status TEXT NOT NULL DEFAULT 'unfulfilled',
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_address JSONB,
  billing_address JSONB,
  notes TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  placed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, order_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_orders TO authenticated;
GRANT ALL ON public.commerce_orders TO service_role;
ALTER TABLE public.commerce_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "orders workspace access" ON public.commerce_orders FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE TABLE public.commerce_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.commerce_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_order_items TO authenticated;
GRANT ALL ON public.commerce_order_items TO service_role;
ALTER TABLE public.commerce_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order items via order" ON public.commerce_order_items FOR ALL TO authenticated
  USING (order_id IN (SELECT id FROM public.commerce_orders WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())))
  WITH CHECK (order_id IN (SELECT id FROM public.commerce_orders WHERE workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())));

CREATE TABLE public.commerce_payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  order_id UUID REFERENCES public.commerce_orders(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_reference TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  url TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_payment_links TO authenticated;
GRANT SELECT ON public.commerce_payment_links TO anon;
GRANT ALL ON public.commerce_payment_links TO service_role;
ALTER TABLE public.commerce_payment_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment links workspace" ON public.commerce_payment_links FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "payment links public read active" ON public.commerce_payment_links FOR SELECT TO anon
  USING (status = 'active');

CREATE TABLE public.commerce_order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.commerce_orders(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_id UUID,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commerce_order_events TO authenticated;
GRANT ALL ON public.commerce_order_events TO service_role;
ALTER TABLE public.commerce_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order events workspace" ON public.commerce_order_events FOR ALL TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()))
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()));

CREATE INDEX idx_commerce_carts_ws ON public.commerce_carts(workspace_id);
CREATE INDEX idx_commerce_carts_conv ON public.commerce_carts(conversation_id);
CREATE INDEX idx_commerce_orders_ws ON public.commerce_orders(workspace_id, created_at DESC);
CREATE INDEX idx_commerce_orders_contact ON public.commerce_orders(contact_id);
CREATE INDEX idx_commerce_orders_status ON public.commerce_orders(status, payment_status);
CREATE INDEX idx_commerce_order_items_order ON public.commerce_order_items(order_id);
CREATE INDEX idx_commerce_payment_links_token ON public.commerce_payment_links(token);
CREATE INDEX idx_commerce_order_events_order ON public.commerce_order_events(order_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.commerce_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_commerce_carts_updated BEFORE UPDATE ON public.commerce_carts FOR EACH ROW EXECUTE FUNCTION public.commerce_touch_updated_at();
CREATE TRIGGER trg_commerce_orders_updated BEFORE UPDATE ON public.commerce_orders FOR EACH ROW EXECUTE FUNCTION public.commerce_touch_updated_at();
CREATE TRIGGER trg_commerce_payment_links_updated BEFORE UPDATE ON public.commerce_payment_links FOR EACH ROW EXECUTE FUNCTION public.commerce_touch_updated_at();
