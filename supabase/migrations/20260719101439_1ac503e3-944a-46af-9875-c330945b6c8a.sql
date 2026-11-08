
ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by uuid;

ALTER TABLE public.plugins
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by uuid;

CREATE TABLE IF NOT EXISTS public.plugin_security_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id uuid NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.plugin_versions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  severity text,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  score int,
  scanner text NOT NULL DEFAULT 'internal',
  scanned_by uuid,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_security_scans TO authenticated;
GRANT ALL ON public.plugin_security_scans TO service_role;
ALTER TABLE public.plugin_security_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins manage security scans" ON public.plugin_security_scans
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Publishers view their scans" ON public.plugin_security_scans
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plugins p WHERE p.id = plugin_id AND p.publisher_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.plugin_compatibility_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id uuid NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  version_id uuid REFERENCES public.plugin_versions(id) ON DELETE SET NULL,
  target_platform text NOT NULL DEFAULT 'swiffer',
  target_version text,
  status text NOT NULL DEFAULT 'pending',
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_by uuid,
  checked_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_compatibility_checks TO authenticated;
GRANT ALL ON public.plugin_compatibility_checks TO service_role;
ALTER TABLE public.plugin_compatibility_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins manage compat checks" ON public.plugin_compatibility_checks
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Publishers view their compat" ON public.plugin_compatibility_checks
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.plugins p WHERE p.id = plugin_id AND p.publisher_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.marketplace_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  reason text,
  moderator_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.marketplace_moderation_log TO authenticated;
GRANT ALL ON public.marketplace_moderation_log TO service_role;
ALTER TABLE public.marketplace_moderation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Superadmins view moderation log" ON public.marketplace_moderation_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Superadmins insert moderation log" ON public.marketplace_moderation_log
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'superadmin') AND moderator_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_plugin_security_scans_plugin ON public.plugin_security_scans(plugin_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_plugin_compat_plugin ON public.plugin_compatibility_checks(plugin_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_log_entity ON public.marketplace_moderation_log(entity_type, entity_id, created_at DESC);
