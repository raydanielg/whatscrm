CREATE TABLE public.workspace_payment_gateway_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  enabled boolean,
  is_default boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider_id)
);

CREATE UNIQUE INDEX workspace_payment_gateway_one_default
  ON public.workspace_payment_gateway_settings (workspace_id)
  WHERE is_default;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_payment_gateway_settings TO authenticated;
GRANT ALL ON public.workspace_payment_gateway_settings TO service_role;

ALTER TABLE public.workspace_payment_gateway_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wpgs_select_members"
  ON public.workspace_payment_gateway_settings FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "wpgs_write_admins"
  ON public.workspace_payment_gateway_settings FOR ALL TO authenticated
  USING (public.is_workspace_admin(workspace_id, auth.uid()) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE TRIGGER workspace_payment_gateway_settings_touch
  BEFORE UPDATE ON public.workspace_payment_gateway_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();