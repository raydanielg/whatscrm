
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Extend contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS lifecycle_stage text NOT NULL DEFAULT 'lead'
    CHECK (lifecycle_stage IN ('subscriber','lead','marketing_qualified','sales_qualified','opportunity','customer','evangelist','other')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','archived')),
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS do_not_contact boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS locale text,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS contacts_workspace_idx ON public.contacts(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS contacts_org_idx ON public.contacts(organization_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS contacts_owner_idx ON public.contacts(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS contacts_company_idx ON public.contacts(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS contacts_email_idx ON public.contacts(workspace_id, lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS contacts_lifecycle_idx ON public.contacts(workspace_id, lifecycle_stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS contacts_name_trgm ON public.contacts USING gin (name gin_trgm_ops) WHERE deleted_at IS NULL;

-- Companies
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  legal_name text, domain text, website text, industry text,
  company_size text CHECK (company_size IN ('1-10','11-50','51-200','201-500','501-1000','1001-5000','5000+') OR company_size IS NULL),
  annual_revenue numeric(18,2), currency text DEFAULT 'USD',
  phone text, email text, description text, logo_url text,
  linkedin_url text, twitter_handle text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  source text, tags text[] DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS companies_workspace_idx ON public.companies(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS companies_owner_idx ON public.companies(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS companies_domain_idx ON public.companies(workspace_id, lower(domain)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS companies_name_trgm ON public.companies USING gin (name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE POLICY "companies_select" ON public.companies FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "companies_insert" ON public.companies FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "companies_update" ON public.companies FOR UPDATE USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "companies_delete" ON public.companies FOR DELETE USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contacts_company_id_fkey') THEN
    ALTER TABLE public.contacts ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name text, last_name text, full_name text, email text, phone text,
  company_name text, job_title text, source text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','working','nurturing','qualified','unqualified','converted')),
  score int NOT NULL DEFAULT 0,
  rating text CHECK (rating IN ('hot','warm','cold') OR rating IS NULL),
  notes text, tags text[] DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  converted_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  converted_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  converted_deal_id uuid,
  converted_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS leads_workspace_idx ON public.leads(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS leads_owner_idx ON public.leads(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS leads_email_idx ON public.leads(workspace_id, lower(email)) WHERE deleted_at IS NULL;
CREATE POLICY "leads_select" ON public.leads FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "leads_insert" ON public.leads FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "leads_update" ON public.leads FOR UPDATE USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "leads_delete" ON public.leads FOR DELETE USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Deal pipelines / stages
CREATE TABLE IF NOT EXISTS public.deal_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL, description text,
  is_default boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_pipelines TO authenticated;
GRANT ALL ON public.deal_pipelines TO service_role;
ALTER TABLE public.deal_pipelines ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS deal_pipelines_ws_idx ON public.deal_pipelines(workspace_id) WHERE deleted_at IS NULL;
CREATE POLICY "deal_pipelines_select" ON public.deal_pipelines FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "deal_pipelines_write" ON public.deal_pipelines FOR ALL
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));
CREATE TRIGGER deal_pipelines_updated_at BEFORE UPDATE ON public.deal_pipelines FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.deal_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.deal_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0,
  probability numeric(5,2) NOT NULL DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_stages TO authenticated;
GRANT ALL ON public.deal_stages TO service_role;
ALTER TABLE public.deal_stages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS deal_stages_pipeline_idx ON public.deal_stages(pipeline_id, position);
CREATE POLICY "deal_stages_select" ON public.deal_stages FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "deal_stages_write" ON public.deal_stages FOR ALL
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));
CREATE TRIGGER deal_stages_updated_at BEFORE UPDATE ON public.deal_stages FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Deals
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.deal_pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.deal_stages(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  title text NOT NULL, description text,
  amount numeric(18,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  probability numeric(5,2) NOT NULL DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date date, actual_close_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','abandoned')),
  loss_reason text, source text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  tags text[] DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS deals_workspace_idx ON public.deals(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS deals_owner_idx ON public.deals(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS deals_stage_idx ON public.deals(stage_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS deals_status_idx ON public.deals(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS deals_contact_idx ON public.deals(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS deals_company_idx ON public.deals(company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS deals_close_date_idx ON public.deals(workspace_id, expected_close_date) WHERE deleted_at IS NULL;
CREATE POLICY "deals_select" ON public.deals FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "deals_insert" ON public.deals FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "deals_update" ON public.deals FOR UPDATE USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "deals_delete" ON public.deals FOR DELETE USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));
CREATE TRIGGER deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_converted_deal_fkey') THEN
    ALTER TABLE public.leads ADD CONSTRAINT leads_converted_deal_fkey FOREIGN KEY (converted_deal_id) REFERENCES public.deals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Tasks
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL, description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_at timestamptz, completed_at timestamptz, reminder_at timestamptz,
  entity_type text CHECK (entity_type IN ('contact','company','lead','deal') OR entity_type IS NULL),
  entity_id uuid,
  tags text[] DEFAULT '{}',
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS tasks_workspace_idx ON public.tasks(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON public.tasks(assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(workspace_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_due_idx ON public.tasks(workspace_id, due_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS tasks_entity_idx ON public.tasks(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Notes
CREATE TABLE IF NOT EXISTS public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('contact','company','lead','deal','task')),
  entity_id uuid NOT NULL,
  body text NOT NULL,
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS notes_entity_idx ON public.notes(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS notes_workspace_idx ON public.notes(workspace_id) WHERE deleted_at IS NULL;
CREATE POLICY "notes_select" ON public.notes FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "notes_insert" ON public.notes FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND author_id = auth.uid());
CREATE POLICY "notes_update" ON public.notes FOR UPDATE USING (author_id = auth.uid() OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "notes_delete" ON public.notes FOR DELETE USING (author_id = auth.uid() OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON public.notes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Tags
CREATE TABLE IF NOT EXISTS public.crm_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text DEFAULT '#6366f1',
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tags TO authenticated;
GRANT ALL ON public.crm_tags TO service_role;
ALTER TABLE public.crm_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_tags_select" ON public.crm_tags FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "crm_tags_write" ON public.crm_tags FOR ALL USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER crm_tags_updated_at BEFORE UPDATE ON public.crm_tags FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.crm_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.crm_tags(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact','company','lead','deal','task')),
  entity_id uuid NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tag_id, entity_type, entity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tag_assignments TO authenticated;
GRANT ALL ON public.crm_tag_assignments TO service_role;
ALTER TABLE public.crm_tag_assignments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS tag_assignments_entity_idx ON public.crm_tag_assignments(entity_type, entity_id);
CREATE POLICY "tag_assignments_select" ON public.crm_tag_assignments FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "tag_assignments_write" ON public.crm_tag_assignments FOR ALL USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Custom field definitions
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact','company','lead','deal','task')),
  key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','textarea','number','decimal','date','datetime','boolean','select','multi_select','email','phone','url','currency')),
  options jsonb DEFAULT '[]'::jsonb,
  default_value jsonb,
  is_required boolean NOT NULL DEFAULT false,
  is_unique boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (workspace_id, entity_type, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_field_definitions TO authenticated;
GRANT ALL ON public.custom_field_definitions TO service_role;
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS custom_fields_ws_idx ON public.custom_field_definitions(workspace_id, entity_type) WHERE deleted_at IS NULL;
CREATE POLICY "custom_fields_select" ON public.custom_field_definitions FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "custom_fields_write" ON public.custom_field_definitions FOR ALL
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role,'manager'::workspace_role]));
CREATE TRIGGER custom_fields_updated_at BEFORE UPDATE ON public.custom_field_definitions FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Addresses
CREATE TABLE IF NOT EXISTS public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact','company','lead')),
  entity_id uuid NOT NULL,
  label text,
  address_type text CHECK (address_type IN ('billing','shipping','home','work','other') OR address_type IS NULL),
  street1 text, street2 text, city text, region text, postal_code text, country text,
  latitude numeric(9,6), longitude numeric(9,6),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS addresses_entity_idx ON public.addresses(entity_type, entity_id);
CREATE POLICY "addresses_select" ON public.addresses FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "addresses_write" ON public.addresses FOR ALL USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER addresses_updated_at BEFORE UPDATE ON public.addresses FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Social profiles
CREATE TABLE IF NOT EXISTS public.social_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact','company','lead')),
  entity_id uuid NOT NULL,
  platform text NOT NULL CHECK (platform IN ('linkedin','twitter','x','facebook','instagram','github','tiktok','youtube','whatsapp','website','other')),
  handle text, url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_profiles TO authenticated;
GRANT ALL ON public.social_profiles TO service_role;
ALTER TABLE public.social_profiles ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS social_profiles_entity_idx ON public.social_profiles(entity_type, entity_id);
CREATE POLICY "social_profiles_select" ON public.social_profiles FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "social_profiles_write" ON public.social_profiles FOR ALL USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER social_profiles_updated_at BEFORE UPDATE ON public.social_profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Attachments (link files -> entities)
CREATE TABLE IF NOT EXISTS public.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact','company','lead','deal','task','note')),
  entity_id uuid NOT NULL,
  attached_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, entity_type, entity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attachments TO authenticated;
GRANT ALL ON public.attachments TO service_role;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS attachments_entity_idx ON public.attachments(entity_type, entity_id);
CREATE POLICY "attachments_select" ON public.attachments FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "attachments_write" ON public.attachments FOR ALL USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Communications history
CREATE TABLE IF NOT EXISTS public.communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('contact','company','lead','deal')),
  entity_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms','whatsapp','call','meeting','chat','note','other')),
  direction text CHECK (direction IN ('inbound','outbound','internal') OR direction IS NULL),
  subject text, body text, summary text,
  from_address text, to_address text,
  cc text[], bcc text[],
  status text CHECK (status IN ('draft','sent','delivered','read','failed','received') OR status IS NULL),
  provider text, provider_message_id text,
  duration_seconds int,
  scheduled_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communications TO authenticated;
GRANT ALL ON public.communications TO service_role;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS communications_entity_idx ON public.communications(entity_type, entity_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS communications_workspace_idx ON public.communications(workspace_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS communications_channel_idx ON public.communications(workspace_id, channel) WHERE deleted_at IS NULL;
CREATE POLICY "communications_select" ON public.communications FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "communications_insert" ON public.communications FOR INSERT WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "communications_update" ON public.communications FOR UPDATE USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "communications_delete" ON public.communications FOR DELETE USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE TRIGGER communications_updated_at BEFORE UPDATE ON public.communications FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Audit trigger for CRM tables
CREATE OR REPLACE FUNCTION public.tg_crm_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _resource text := TG_ARGV[0];
  _ws uuid; _org uuid; _action text; _changes jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _ws := (to_jsonb(NEW)->>'workspace_id')::uuid;
    _org := (to_jsonb(NEW)->>'organization_id')::uuid;
    _action := 'create';
    _changes := jsonb_build_object('after', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN RETURN NEW; END IF;
    _ws := (to_jsonb(NEW)->>'workspace_id')::uuid;
    _org := (to_jsonb(NEW)->>'organization_id')::uuid;
    _action := CASE WHEN (to_jsonb(OLD)->>'deleted_at') IS NULL AND (to_jsonb(NEW)->>'deleted_at') IS NOT NULL THEN 'soft_delete' ELSE 'update' END;
    _changes := jsonb_build_object('before', to_jsonb(OLD) - 'updated_at', 'after', to_jsonb(NEW) - 'updated_at');
  ELSIF TG_OP = 'DELETE' THEN
    _ws := (to_jsonb(OLD)->>'workspace_id')::uuid;
    _org := (to_jsonb(OLD)->>'organization_id')::uuid;
    _action := 'delete';
    _changes := jsonb_build_object('deleted', to_jsonb(OLD));
  END IF;
  INSERT INTO public.audit_logs (organization_id, workspace_id, actor_id, action, resource_type, resource_id, changes)
  VALUES (_org, _ws, auth.uid(), _action, _resource, COALESCE((to_jsonb(COALESCE(NEW, OLD))->>'id'), ''), _changes);
  RETURN COALESCE(NEW, OLD);
END; $$;

REVOKE EXECUTE ON FUNCTION public.tg_crm_audit() FROM anon, public;

CREATE TRIGGER audit_companies AFTER INSERT OR UPDATE OR DELETE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.tg_crm_audit('company');
CREATE TRIGGER audit_leads AFTER INSERT OR UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.tg_crm_audit('lead');
CREATE TRIGGER audit_deals AFTER INSERT OR UPDATE OR DELETE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.tg_crm_audit('deal');
CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.tg_crm_audit('task');

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.deals, public.tasks, public.leads, public.companies, public.notes, public.communications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.deals REPLICA IDENTITY FULL;
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.companies REPLICA IDENTITY FULL;
ALTER TABLE public.notes REPLICA IDENTITY FULL;
ALTER TABLE public.communications REPLICA IDENTITY FULL;
