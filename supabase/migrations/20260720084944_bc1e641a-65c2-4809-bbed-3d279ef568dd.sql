
-- Phonebooks (contact groups for broadcasting)
CREATE TABLE public.phonebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  contact_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_phonebooks_workspace ON public.phonebooks(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.phonebooks TO authenticated;
GRANT ALL ON public.phonebooks TO service_role;

ALTER TABLE public.phonebooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view phonebooks"
  ON public.phonebooks FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
                 WHERE wm.workspace_id = phonebooks.workspace_id
                   AND wm.user_id = auth.uid()));

CREATE POLICY "Members can insert phonebooks"
  ON public.phonebooks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm
                      WHERE wm.workspace_id = phonebooks.workspace_id
                        AND wm.user_id = auth.uid()));

CREATE POLICY "Members can update phonebooks"
  ON public.phonebooks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
                 WHERE wm.workspace_id = phonebooks.workspace_id
                   AND wm.user_id = auth.uid()));

CREATE POLICY "Members can delete phonebooks"
  ON public.phonebooks FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
                 WHERE wm.workspace_id = phonebooks.workspace_id
                   AND wm.user_id = auth.uid()));

-- Phonebook contacts (rows with 5 custom variables for template merging)
CREATE TABLE public.phonebook_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  phonebook_id uuid NOT NULL REFERENCES public.phonebooks(id) ON DELETE CASCADE,
  name text NOT NULL,
  mobile_number text NOT NULL,
  variable_1 text,
  variable_2 text,
  variable_3 text,
  variable_4 text,
  variable_5 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_phonebook_contacts_workspace ON public.phonebook_contacts(workspace_id);
CREATE INDEX idx_phonebook_contacts_phonebook ON public.phonebook_contacts(phonebook_id);
CREATE INDEX idx_phonebook_contacts_mobile ON public.phonebook_contacts(mobile_number);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.phonebook_contacts TO authenticated;
GRANT ALL ON public.phonebook_contacts TO service_role;

ALTER TABLE public.phonebook_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view phonebook contacts"
  ON public.phonebook_contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
                 WHERE wm.workspace_id = phonebook_contacts.workspace_id
                   AND wm.user_id = auth.uid()));

CREATE POLICY "Members can insert phonebook contacts"
  ON public.phonebook_contacts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm
                      WHERE wm.workspace_id = phonebook_contacts.workspace_id
                        AND wm.user_id = auth.uid()));

CREATE POLICY "Members can update phonebook contacts"
  ON public.phonebook_contacts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
                 WHERE wm.workspace_id = phonebook_contacts.workspace_id
                   AND wm.user_id = auth.uid()));

CREATE POLICY "Members can delete phonebook contacts"
  ON public.phonebook_contacts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm
                 WHERE wm.workspace_id = phonebook_contacts.workspace_id
                   AND wm.user_id = auth.uid()));

-- Timestamps + count triggers
CREATE TRIGGER trg_phonebooks_updated_at
  BEFORE UPDATE ON public.phonebooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_phonebook_contacts_updated_at
  BEFORE UPDATE ON public.phonebook_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.tg_phonebook_contact_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.phonebooks SET contact_count = contact_count + 1 WHERE id = NEW.phonebook_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.phonebooks SET contact_count = GREATEST(contact_count - 1, 0) WHERE id = OLD.phonebook_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' AND NEW.phonebook_id <> OLD.phonebook_id THEN
    UPDATE public.phonebooks SET contact_count = GREATEST(contact_count - 1, 0) WHERE id = OLD.phonebook_id;
    UPDATE public.phonebooks SET contact_count = contact_count + 1 WHERE id = NEW.phonebook_id;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_phonebook_contact_count
  AFTER INSERT OR UPDATE OR DELETE ON public.phonebook_contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_phonebook_contact_count();
