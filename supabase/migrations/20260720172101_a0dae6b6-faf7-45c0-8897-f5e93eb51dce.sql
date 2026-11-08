
CREATE TABLE public.contact_matching_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  strategy TEXT NOT NULL CHECK (strategy IN ('exact','e164','national','last_n_digits')),
  default_country_code TEXT,
  digits_to_match INTEGER CHECK (digits_to_match BETWEEN 4 AND 15),
  enabled BOOLEAN NOT NULL DEFAULT true,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX idx_cmr_workspace_priority ON public.contact_matching_rules(workspace_id, enabled, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_matching_rules TO authenticated;
GRANT ALL ON public.contact_matching_rules TO service_role;

ALTER TABLE public.contact_matching_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read contact_matching_rules"
  ON public.contact_matching_rules FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "ws admins write contact_matching_rules"
  ON public.contact_matching_rules FOR ALL
  TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE TRIGGER trg_cmr_updated
  BEFORE UPDATE ON public.contact_matching_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed a default exact-match rule for every existing workspace
INSERT INTO public.contact_matching_rules (workspace_id, priority, strategy, enabled, label)
SELECT id, 10, 'exact', true, 'Exact phone match'
FROM public.workspaces
ON CONFLICT DO NOTHING;
