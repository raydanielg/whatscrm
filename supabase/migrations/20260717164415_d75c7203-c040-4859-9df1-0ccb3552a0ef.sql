
-- Helper: workspace membership check (idempotent)
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  );
$$;
REVOKE ALL ON FUNCTION public.is_workspace_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated, service_role;

-- Updated_at trigger fn (idempotent)
CREATE OR REPLACE FUNCTION public.bi_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========================================================================
-- 1. Dashboards
-- =========================================================================
CREATE TABLE public.bi_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  layout jsonb NOT NULL DEFAULT '{"cols":12,"rowHeight":80}'::jsonb,
  visibility text NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('private','workspace','public')),
  is_default boolean NOT NULL DEFAULT false,
  icon text,
  tags text[] NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_dashboards TO authenticated;
GRANT ALL ON public.bi_dashboards TO service_role;
ALTER TABLE public.bi_dashboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_dashboards_member_all" ON public.bi_dashboards FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX bi_dashboards_workspace_idx ON public.bi_dashboards(workspace_id);
CREATE TRIGGER bi_dashboards_touch BEFORE UPDATE ON public.bi_dashboards
  FOR EACH ROW EXECUTE FUNCTION public.bi_touch_updated_at();

-- =========================================================================
-- 2. Widgets
-- =========================================================================
CREATE TABLE public.bi_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  dashboard_id uuid NOT NULL REFERENCES public.bi_dashboards(id) ON DELETE CASCADE,
  type text NOT NULL, -- kpi|line|bar|pie|area|table|funnel|heatmap|gauge|number|map
  title text NOT NULL,
  subtitle text,
  data_source text NOT NULL, -- metric key resolved by analytics engine
  config jsonb NOT NULL DEFAULT '{}'::jsonb, -- filters, groupBy, dateRange, thresholds
  position jsonb NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  size jsonb NOT NULL DEFAULT '{"w":4,"h":3}'::jsonb,
  refresh_interval_s integer NOT NULL DEFAULT 60 CHECK (refresh_interval_s >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_widgets TO authenticated;
GRANT ALL ON public.bi_widgets TO service_role;
ALTER TABLE public.bi_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_widgets_member_all" ON public.bi_widgets FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX bi_widgets_dashboard_idx ON public.bi_widgets(dashboard_id);
CREATE INDEX bi_widgets_workspace_idx ON public.bi_widgets(workspace_id);
CREATE TRIGGER bi_widgets_touch BEFORE UPDATE ON public.bi_widgets
  FOR EACH ROW EXECUTE FUNCTION public.bi_touch_updated_at();

-- =========================================================================
-- 3. Reports
-- =========================================================================
CREATE TABLE public.bi_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general', -- sales|marketing|support|conversations|ai|workflow|general
  data_source text NOT NULL, -- e.g. conversations|deals|campaigns|ai_usage|workflow_runs
  chart_type text NOT NULL DEFAULT 'table' CHECK (chart_type IN ('table','line','bar','pie','area','number','funnel','heatmap','gauge')),
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  columns jsonb NOT NULL DEFAULT '[]'::jsonb,
  group_by jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort jsonb NOT NULL DEFAULT '[]'::jsonb,
  date_range jsonb NOT NULL DEFAULT '{"preset":"last_30d"}'::jsonb,
  is_favorite boolean NOT NULL DEFAULT false,
  is_template boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_reports TO authenticated;
GRANT ALL ON public.bi_reports TO service_role;
ALTER TABLE public.bi_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_reports_member_all" ON public.bi_reports FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX bi_reports_workspace_idx ON public.bi_reports(workspace_id);
CREATE INDEX bi_reports_category_idx ON public.bi_reports(workspace_id, category);
CREATE TRIGGER bi_reports_touch BEFORE UPDATE ON public.bi_reports
  FOR EACH ROW EXECUTE FUNCTION public.bi_touch_updated_at();

-- =========================================================================
-- 4. Scheduled Reports
-- =========================================================================
CREATE TABLE public.bi_scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.bi_reports(id) ON DELETE CASCADE,
  name text NOT NULL,
  cron text NOT NULL, -- e.g. "0 8 * * 1"
  timezone text NOT NULL DEFAULT 'UTC',
  recipients text[] NOT NULL DEFAULT '{}',
  format text NOT NULL DEFAULT 'pdf' CHECK (format IN ('pdf','csv','xlsx','json')),
  delivery text NOT NULL DEFAULT 'email' CHECK (delivery IN ('email','webhook','slack')),
  webhook_url text,
  enabled boolean NOT NULL DEFAULT true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_scheduled_reports TO authenticated;
GRANT ALL ON public.bi_scheduled_reports TO service_role;
ALTER TABLE public.bi_scheduled_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_sched_member_all" ON public.bi_scheduled_reports FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX bi_sched_workspace_idx ON public.bi_scheduled_reports(workspace_id);
CREATE INDEX bi_sched_next_run_idx ON public.bi_scheduled_reports(next_run_at) WHERE enabled;
CREATE TRIGGER bi_sched_touch BEFORE UPDATE ON public.bi_scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION public.bi_touch_updated_at();

-- =========================================================================
-- 5. Report Runs
-- =========================================================================
CREATE TABLE public.bi_report_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.bi_reports(id) ON DELETE SET NULL,
  scheduled_id uuid REFERENCES public.bi_scheduled_reports(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed')),
  triggered_by text NOT NULL DEFAULT 'manual', -- manual|schedule|api
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  output_url text,
  format text,
  row_count integer,
  duration_ms integer,
  error jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.bi_report_runs TO authenticated;
GRANT ALL ON public.bi_report_runs TO service_role;
ALTER TABLE public.bi_report_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_report_runs_member_read" ON public.bi_report_runs FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "bi_report_runs_member_insert" ON public.bi_report_runs FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX bi_report_runs_report_idx ON public.bi_report_runs(report_id, started_at DESC);
CREATE INDEX bi_report_runs_workspace_idx ON public.bi_report_runs(workspace_id, started_at DESC);

-- =========================================================================
-- 6. KPIs
-- =========================================================================
CREATE TABLE public.bi_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  unit text NOT NULL DEFAULT 'count', -- count|currency|percent|duration_ms
  formula jsonb NOT NULL DEFAULT '{}'::jsonb, -- {source, metric, filters, aggregation}
  target numeric,
  direction text NOT NULL DEFAULT 'higher' CHECK (direction IN ('higher','lower','neutral')),
  refresh_interval_s integer NOT NULL DEFAULT 300,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bi_kpis TO authenticated;
GRANT ALL ON public.bi_kpis TO service_role;
ALTER TABLE public.bi_kpis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_kpis_member_all" ON public.bi_kpis FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX bi_kpis_workspace_idx ON public.bi_kpis(workspace_id);
CREATE TRIGGER bi_kpis_touch BEFORE UPDATE ON public.bi_kpis
  FOR EACH ROW EXECUTE FUNCTION public.bi_touch_updated_at();

-- =========================================================================
-- 7. KPI Snapshots
-- =========================================================================
CREATE TABLE public.bi_kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kpi_id uuid NOT NULL REFERENCES public.bi_kpis(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  granularity text NOT NULL DEFAULT 'day' CHECK (granularity IN ('hour','day','week','month','quarter','year')),
  value numeric NOT NULL,
  previous_value numeric,
  delta_pct numeric,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kpi_id, period_start, granularity)
);
GRANT SELECT, INSERT ON public.bi_kpi_snapshots TO authenticated;
GRANT ALL ON public.bi_kpi_snapshots TO service_role;
ALTER TABLE public.bi_kpi_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_kpi_snap_member_read" ON public.bi_kpi_snapshots FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "bi_kpi_snap_member_insert" ON public.bi_kpi_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX bi_kpi_snap_kpi_idx ON public.bi_kpi_snapshots(kpi_id, period_start DESC);
CREATE INDEX bi_kpi_snap_workspace_idx ON public.bi_kpi_snapshots(workspace_id, computed_at DESC);

-- =========================================================================
-- 8. Metric Cache (aggregation cache)
-- =========================================================================
CREATE TABLE public.bi_metric_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  params_hash text NOT NULL,
  value jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, metric_key, params_hash)
);
GRANT SELECT ON public.bi_metric_cache TO authenticated;
GRANT ALL ON public.bi_metric_cache TO service_role;
ALTER TABLE public.bi_metric_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_metric_cache_member_read" ON public.bi_metric_cache FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX bi_metric_cache_lookup_idx ON public.bi_metric_cache(workspace_id, metric_key, params_hash);
CREATE INDEX bi_metric_cache_expires_idx ON public.bi_metric_cache(expires_at);

-- =========================================================================
-- 9. Calculation Queue
-- =========================================================================
CREATE TABLE public.bi_calc_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL, -- kpi_refresh|report_run|forecast|aggregate|export
  target_id uuid, -- references KPI/report/etc depending on kind
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','success','failed','retry','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  finished_at timestamptz,
  last_error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bi_calc_queue TO authenticated;
GRANT ALL ON public.bi_calc_queue TO service_role;
ALTER TABLE public.bi_calc_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_calc_queue_member_read" ON public.bi_calc_queue FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX bi_calc_queue_lease_idx ON public.bi_calc_queue(status, run_at, priority) WHERE status IN ('queued','retry');
CREATE INDEX bi_calc_queue_workspace_idx ON public.bi_calc_queue(workspace_id, status);
CREATE TRIGGER bi_calc_queue_touch BEFORE UPDATE ON public.bi_calc_queue
  FOR EACH ROW EXECUTE FUNCTION public.bi_touch_updated_at();

-- =========================================================================
-- 10. Forecasts
-- =========================================================================
CREATE TABLE public.bi_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  method text NOT NULL DEFAULT 'linear' CHECK (method IN ('linear','ema','holt_winters','arima','ai')),
  horizon_days integer NOT NULL DEFAULT 30,
  historical jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{t, y}]
  projection jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{t, y, low, high}]
  accuracy jsonb, -- {mape, rmse}
  computed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (workspace_id, metric_key, method, horizon_days)
);
GRANT SELECT ON public.bi_forecasts TO authenticated;
GRANT ALL ON public.bi_forecasts TO service_role;
ALTER TABLE public.bi_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bi_forecasts_member_read" ON public.bi_forecasts FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX bi_forecasts_workspace_idx ON public.bi_forecasts(workspace_id, metric_key);

-- Realtime for dashboards, widgets, KPIs
ALTER PUBLICATION supabase_realtime ADD TABLE public.bi_dashboards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bi_widgets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bi_kpi_snapshots;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bi_report_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bi_calc_queue;
