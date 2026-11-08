
CREATE TABLE public.ticket_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  contact_id uuid,
  company_id uuid,
  name text NOT NULL,
  asset_type text NOT NULL DEFAULT 'device', -- device|software|licence|subscription|hardware|other
  identifier text, -- serial / licence key / SKU
  vendor text,
  model text,
  status text DEFAULT 'active', -- active|retired|repair|lost
  purchased_at date,
  warranty_until date,
  location text,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_assets TO authenticated;
GRANT ALL ON public.ticket_assets TO service_role;
ALTER TABLE public.ticket_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage ticket_assets" ON public.ticket_assets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_assets.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_assets.workspace_id AND wm.user_id = auth.uid()));

CREATE TABLE public.ticket_asset_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.ticket_assets(id) ON DELETE CASCADE,
  linked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, asset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_asset_links TO authenticated;
GRANT ALL ON public.ticket_asset_links TO service_role;
ALTER TABLE public.ticket_asset_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members manage ticket_asset_links" ON public.ticket_asset_links
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_asset_links.workspace_id AND wm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_asset_links.workspace_id AND wm.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ticket_assets_workspace ON public.ticket_assets(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_ticket_assets_contact ON public.ticket_assets(contact_id);
CREATE INDEX IF NOT EXISTS idx_ticket_asset_links_ticket ON public.ticket_asset_links(ticket_id);

-- Realtime for helpdesk-critical tables (safe if already added)
DO $$ BEGIN
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_sla_tracking'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_escalations'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.csat_responses'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    EXECUTE 'CREATE TRIGGER trg_ticket_assets_updated BEFORE UPDATE ON public.ticket_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()';
  END IF;
END $$;
