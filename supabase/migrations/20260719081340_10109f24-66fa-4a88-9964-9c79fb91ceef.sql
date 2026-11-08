
ALTER TABLE public.commerce_payment_links
  ADD COLUMN IF NOT EXISTS allow_partial boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_interval text,
  ADD COLUMN IF NOT EXISTS recurring_count integer,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE TABLE IF NOT EXISTS public.commerce_payment_link_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  payment_link_id uuid NOT NULL REFERENCES public.commerce_payment_links(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text,
  amount numeric(12,2),
  currency text,
  actor_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.commerce_payment_link_events TO authenticated;
GRANT SELECT, INSERT ON public.commerce_payment_link_events TO anon;
GRANT ALL ON public.commerce_payment_link_events TO service_role;

ALTER TABLE public.commerce_payment_link_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pl events workspace read" ON public.commerce_payment_link_events
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "pl events workspace insert" ON public.commerce_payment_link_events
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));

CREATE POLICY "pl events anon insert view" ON public.commerce_payment_link_events
  FOR INSERT TO anon
  WITH CHECK (event_type IN ('viewed', 'payment_started'));

CREATE INDEX IF NOT EXISTS idx_pl_events_link ON public.commerce_payment_link_events(payment_link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_payment_links_ws ON public.commerce_payment_links(workspace_id, created_at DESC);
