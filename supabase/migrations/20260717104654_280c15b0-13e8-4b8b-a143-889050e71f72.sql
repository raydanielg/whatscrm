
ALTER TABLE public.contacts
  ALTER COLUMN phone DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS phones jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS address jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_agent_id uuid,
  ADD COLUMN IF NOT EXISTS lead_status text,
  ADD COLUMN IF NOT EXISTS customer_status text;

CREATE INDEX IF NOT EXISTS idx_contacts_ws_favorite ON public.contacts(workspace_id, is_favorite) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_ws_archived ON public.contacts(workspace_id, is_archived);
CREATE INDEX IF NOT EXISTS idx_contacts_ws_owner ON public.contacts(workspace_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_ws_agent ON public.contacts(workspace_id, assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_contacts_ws_lead_status ON public.contacts(workspace_id, lead_status);
CREATE INDEX IF NOT EXISTS idx_contacts_ws_customer_status ON public.contacts(workspace_id, customer_status);
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON public.contacts USING gin ((coalesce(display_name,'') || ' ' || coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(email,'')) gin_trgm_ops);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='contacts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contacts;
  END IF;
END $$;

ALTER TABLE public.contacts REPLICA IDENTITY FULL;
