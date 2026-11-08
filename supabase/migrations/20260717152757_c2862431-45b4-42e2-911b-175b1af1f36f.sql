
CREATE TABLE IF NOT EXISTS public.saved_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  created_by uuid,
  name text NOT NULL,
  description text,
  filter_definition jsonb NOT NULL DEFAULT '{"conditions":[],"logic":"AND"}'::jsonb,
  is_favorite boolean NOT NULL DEFAULT false,
  is_shared boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  member_count integer NOT NULL DEFAULT 0,
  last_computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_audiences_ws_idx ON public.saved_audiences(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_audiences TO authenticated;
GRANT ALL ON public.saved_audiences TO service_role;

ALTER TABLE public.saved_audiences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members read saved audiences"
  ON public.saved_audiences FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "workspace members write saved audiences"
  ON public.saved_audiences FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "workspace members update saved audiences"
  ON public.saved_audiences FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "workspace members delete saved audiences"
  ON public.saved_audiences FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER saved_audiences_touch
  BEFORE UPDATE ON public.saved_audiences
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_audiences;
