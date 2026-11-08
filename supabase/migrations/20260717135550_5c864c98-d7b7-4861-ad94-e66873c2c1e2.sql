
CREATE TABLE IF NOT EXISTS public.search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  query text NOT NULL,
  scope text,
  result_count integer NOT NULL DEFAULT 0,
  clicked_entity_type text,
  clicked_entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_search_history_ws_user_time
  ON public.search_history (workspace_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_ws_query
  ON public.search_history (workspace_id, lower(query), created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.search_history TO authenticated;
GRANT ALL ON public.search_history TO service_role;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "search_history own read" ON public.search_history
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = search_history.workspace_id AND m.user_id = auth.uid())
  );
CREATE POLICY "search_history own write" ON public.search_history
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = search_history.workspace_id AND m.user_id = auth.uid())
  );
CREATE POLICY "search_history own delete" ON public.search_history
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  query text NOT NULL,
  scope text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  color text,
  icon text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_searches_ws_user
  ON public.saved_searches (workspace_id, user_id, is_pinned DESC, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches TO authenticated;
GRANT ALL ON public.saved_searches TO service_role;
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "saved_searches visible" ON public.saved_searches
  FOR SELECT TO authenticated USING (
    (user_id = auth.uid() OR is_shared = true)
    AND EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = saved_searches.workspace_id AND m.user_id = auth.uid())
  );
CREATE POLICY "saved_searches own manage" ON public.saved_searches
  FOR ALL TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.workspace_members m
      WHERE m.workspace_id = saved_searches.workspace_id AND m.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.touch_saved_search_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_saved_searches_touch ON public.saved_searches;
CREATE TRIGGER trg_saved_searches_touch
  BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.touch_saved_search_updated_at();
