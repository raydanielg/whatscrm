
CREATE TABLE public.whatsapp_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'CONTACT_US',
  flow_id text,
  status text NOT NULL DEFAULT 'DRAFT',
  description text,
  flow_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  submissions_count integer NOT NULL DEFAULT 0,
  waba_id text,
  last_published_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_forms_status_check CHECK (status IN ('DRAFT','PUBLISHED','DEPRECATED','BLOCKED')),
  CONSTRAINT whatsapp_forms_category_check CHECK (category IN ('SIGN_UP','SIGN_IN','APPOINTMENT_BOOKING','LEAD_GENERATION','SHOPPING','CONTACT_US','CUSTOMER_SUPPORT','SURVEY','OTHER'))
);

CREATE INDEX idx_whatsapp_forms_workspace ON public.whatsapp_forms(workspace_id);
CREATE INDEX idx_whatsapp_forms_status ON public.whatsapp_forms(workspace_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_forms TO authenticated;
GRANT ALL ON public.whatsapp_forms TO service_role;

ALTER TABLE public.whatsapp_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_forms by workspace member"
  ON public.whatsapp_forms
  TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(workspace_id, auth.uid()));

CREATE TRIGGER trg_whatsapp_forms_updated
  BEFORE UPDATE ON public.whatsapp_forms
  FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();

CREATE TABLE public.whatsapp_form_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  form_id uuid NOT NULL REFERENCES public.whatsapp_forms(id) ON DELETE CASCADE,
  contact_wa_id text,
  contact_name text,
  response_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_form_submissions_form ON public.whatsapp_form_submissions(form_id, received_at DESC);
CREATE INDEX idx_whatsapp_form_submissions_workspace ON public.whatsapp_form_submissions(workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_form_submissions TO authenticated;
GRANT ALL ON public.whatsapp_form_submissions TO service_role;

ALTER TABLE public.whatsapp_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_form_submissions by workspace member"
  ON public.whatsapp_form_submissions
  TO authenticated
  USING (is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (is_workspace_member(workspace_id, auth.uid()));
