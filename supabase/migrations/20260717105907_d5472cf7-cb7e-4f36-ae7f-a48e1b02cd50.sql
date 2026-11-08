
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS customer_lifetime_value numeric,
  ADD COLUMN IF NOT EXISTS customer_health_score integer,
  ADD COLUMN IF NOT EXISTS segments text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS converted_from_lead_id uuid,
  ADD COLUMN IF NOT EXISTS first_customer_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS disqualified_at timestamptz,
  ADD COLUMN IF NOT EXISTS disqualify_reason text,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS score_reason text;

CREATE INDEX IF NOT EXISTS idx_leads_workspace_status ON public.leads(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_workspace_owner ON public.leads(workspace_id, owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_workspace_score ON public.leads(workspace_id, score DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_workspace_source ON public.leads(workspace_id, source) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_lifecycle ON public.contacts(workspace_id, lifecycle_stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_segments ON public.contacts USING gin(segments) WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.tg_leads_status_stamps()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'qualified' AND NEW.qualified_at IS NULL THEN
      NEW.qualified_at := now();
    END IF;
    IF NEW.status IN ('disqualified','unqualified') AND NEW.disqualified_at IS NULL THEN
      NEW.disqualified_at := now();
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.status = 'qualified' AND NEW.qualified_at IS NULL THEN
      NEW.qualified_at := now();
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS leads_status_stamps ON public.leads;
CREATE TRIGGER leads_status_stamps BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_leads_status_stamps();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.leads REPLICA IDENTITY FULL;
