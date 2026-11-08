CREATE TABLE IF NOT EXISTS public.whatsapp_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone_number text,
  device_type text NOT NULL DEFAULT 'qr' CHECK (device_type IN ('qr','cloud_api','byoa')),
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','connecting','disconnected','banned','expired')),
  platform text,
  battery_level int,
  last_seen_at timestamptz,
  connected_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_devices_workspace ON public.whatsapp_devices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_devices_status ON public.whatsapp_devices(workspace_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_devices TO authenticated;
GRANT ALL ON public.whatsapp_devices TO service_role;

ALTER TABLE public.whatsapp_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_devices_select" ON public.whatsapp_devices
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "wa_devices_insert" ON public.whatsapp_devices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "wa_devices_update" ON public.whatsapp_devices
  FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "wa_devices_delete" ON public.whatsapp_devices
  FOR DELETE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_whatsapp_devices_updated_at
  BEFORE UPDATE ON public.whatsapp_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();