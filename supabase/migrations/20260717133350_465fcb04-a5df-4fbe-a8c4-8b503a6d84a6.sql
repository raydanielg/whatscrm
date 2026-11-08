
CREATE TABLE IF NOT EXISTS public.lead_qualification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  lead_score integer,
  score_rationale text,
  lead_priority text CHECK (lead_priority IN ('low','medium','high','urgent')),
  temperature text CHECK (temperature IN ('hot','warm','cold')),
  purchase_intent numeric CHECK (purchase_intent BETWEEN 0 AND 1),
  purchase_intent_label text,
  customer_interest numeric CHECK (customer_interest BETWEEN 0 AND 1),
  interest_signals text[] NOT NULL DEFAULT '{}',
  buying_stage text CHECK (buying_stage IN ('awareness','consideration','decision','purchase','retention','unknown')),

  deal_probability numeric CHECK (deal_probability BETWEEN 0 AND 1),
  revenue_prediction numeric,
  revenue_currency text DEFAULT 'USD',
  clv_prediction numeric,

  risk_score numeric CHECK (risk_score BETWEEN 0 AND 1),
  risk_reasons text[] NOT NULL DEFAULT '{}',

  recommended_follow_up_at timestamptz,
  recommended_follow_up text,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  next_best_action text,
  insights text[] NOT NULL DEFAULT '{}',

  model text,
  provider_kind text,
  tokens_used integer NOT NULL DEFAULT 0,
  analyzed_at timestamptz,
  needs_reanalysis boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leadq_workspace ON public.lead_qualification(workspace_id);
CREATE INDEX IF NOT EXISTS idx_leadq_workspace_score ON public.lead_qualification(workspace_id, lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leadq_workspace_priority ON public.lead_qualification(workspace_id, lead_priority);
CREATE INDEX IF NOT EXISTS idx_leadq_workspace_temperature ON public.lead_qualification(workspace_id, temperature);
CREATE INDEX IF NOT EXISTS idx_leadq_workspace_stale ON public.lead_qualification(workspace_id) WHERE needs_reanalysis = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_qualification TO authenticated;
GRANT ALL ON public.lead_qualification TO service_role;

ALTER TABLE public.lead_qualification ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read lead_qualification"
  ON public.lead_qualification FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "workspace members write lead_qualification"
  ON public.lead_qualification FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "workspace members update lead_qualification"
  ON public.lead_qualification FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "workspace members delete lead_qualification"
  ON public.lead_qualification FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_leadq_updated_at BEFORE UPDATE ON public.lead_qualification
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Flag stale on lead changes that affect qualification
CREATE OR REPLACE FUNCTION public.tg_leadq_flag_stale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.notes IS DISTINCT FROM NEW.notes)
     OR (OLD.status IS DISTINCT FROM NEW.status)
     OR (OLD.source IS DISTINCT FROM NEW.source)
     OR (OLD.tags IS DISTINCT FROM NEW.tags)
     OR (OLD.company_name IS DISTINCT FROM NEW.company_name)
     OR (OLD.job_title IS DISTINCT FROM NEW.job_title)
     OR (OLD.custom_fields IS DISTINCT FROM NEW.custom_fields) THEN
    UPDATE public.lead_qualification
       SET needs_reanalysis = true, updated_at = now()
     WHERE lead_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_qualification_stale ON public.leads;
CREATE TRIGGER trg_lead_qualification_stale
  AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_leadq_flag_stale();
