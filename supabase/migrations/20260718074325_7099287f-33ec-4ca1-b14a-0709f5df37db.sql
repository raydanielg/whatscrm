
CREATE TABLE public.marketplace_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text NOT NULL,
  description text,
  icon_url text,
  category text NOT NULL,
  vendor text,
  version text NOT NULL DEFAULT '1.0.0',
  featured boolean NOT NULL DEFAULT false,
  recommended boolean NOT NULL DEFAULT false,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  config_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  changelog jsonb NOT NULL DEFAULT '[]'::jsonb,
  docs_url text,
  status text NOT NULL DEFAULT 'available',
  install_count integer NOT NULL DEFAULT 0,
  rating numeric(2,1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.marketplace_integrations TO authenticated, anon;
GRANT ALL ON public.marketplace_integrations TO service_role;
ALTER TABLE public.marketplace_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "marketplace catalog is public read"
  ON public.marketplace_integrations FOR SELECT
  USING (true);

CREATE TABLE public.marketplace_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  integration_id uuid NOT NULL REFERENCES public.marketplace_integrations(id) ON DELETE CASCADE,
  installed_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  version text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  UNIQUE (organization_id, integration_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketplace_installations TO authenticated;
GRANT ALL ON public.marketplace_installations TO service_role;
ALTER TABLE public.marketplace_installations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read installations"
  ON public.marketplace_installations FOR SELECT TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org members manage installations"
  ON public.marketplace_installations FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_mi_updated BEFORE UPDATE ON public.marketplace_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mins_updated BEFORE UPDATE ON public.marketplace_installations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed catalog
INSERT INTO public.marketplace_integrations (slug, name, tagline, category, vendor, version, featured, recommended, scopes, config_schema, changelog, docs_url, rating, install_count) VALUES
('salesforce', 'Salesforce', 'Sync contacts, deals, and activities with Salesforce CRM.', 'CRM', 'Salesforce Inc.', '2.1.0', true, true,
  '["read:contacts","write:contacts","read:opportunities"]'::jsonb,
  '[{"key":"instance_url","label":"Instance URL","type":"text","required":true,"placeholder":"https://acme.my.salesforce.com"},{"key":"sync_direction","label":"Sync direction","type":"select","options":["one-way","two-way"],"required":true}]'::jsonb,
  '[{"version":"2.1.0","date":"2026-06-14","notes":"Bi-directional deal sync"},{"version":"2.0.0","date":"2026-03-02","notes":"OAuth 2.0 migration"},{"version":"1.4.0","date":"2025-12-10","notes":"Custom field mapping"}]'::jsonb,
  'https://docs.swiffer.io/integrations/salesforce', 4.7, 1240),
('hubspot', 'HubSpot', 'Two-way sync with the HubSpot CRM.', 'CRM', 'HubSpot', '1.8.0', true, true,
  '["contacts.read","contacts.write","deals.read"]'::jsonb,
  '[{"key":"portal_id","label":"Portal ID","type":"text","required":true}]'::jsonb,
  '[{"version":"1.8.0","date":"2026-05-20","notes":"Custom properties"},{"version":"1.7.0","date":"2026-02-08","notes":"Deal pipeline mapping"}]'::jsonb,
  'https://docs.swiffer.io/integrations/hubspot', 4.6, 980),
('mailchimp', 'Mailchimp', 'Push audience segments to Mailchimp campaigns.', 'Marketing', 'Intuit', '1.2.0', false, true,
  '["audiences:write","campaigns:read"]'::jsonb,
  '[{"key":"list_id","label":"Audience list ID","type":"text","required":true}]'::jsonb,
  '[{"version":"1.2.0","date":"2026-04-01","notes":"Tag sync"}]'::jsonb,
  'https://docs.swiffer.io/integrations/mailchimp', 4.3, 540),
('slack', 'Slack', 'Send conversation alerts and notifications to Slack.', 'Communication', 'Slack Technologies', '3.0.1', true, true,
  '["chat:write","channels:read"]'::jsonb,
  '[{"key":"default_channel","label":"Default channel","type":"text","required":true,"placeholder":"#sales"}]'::jsonb,
  '[{"version":"3.0.1","date":"2026-07-10","notes":"Slash-command support"},{"version":"3.0.0","date":"2026-05-01","notes":"Interactive blocks"}]'::jsonb,
  'https://docs.swiffer.io/integrations/slack', 4.9, 3200),
('microsoft-teams', 'Microsoft Teams', 'Route Swiffer conversations into Microsoft Teams channels.', 'Communication', 'Microsoft', '1.4.0', false, false,
  '["ChannelMessage.Send","Chat.ReadWrite"]'::jsonb,
  '[{"key":"tenant_id","label":"Tenant ID","type":"text","required":true}]'::jsonb,
  '[{"version":"1.4.0","date":"2026-06-01","notes":"Adaptive cards"}]'::jsonb,
  'https://docs.swiffer.io/integrations/teams', 4.1, 410),
('stripe', 'Stripe', 'Accept payments and reconcile invoices automatically.', 'Payments', 'Stripe', '2.4.0', true, true,
  '["charges:read","payment_intents:write","invoices:read"]'::jsonb,
  '[{"key":"account_id","label":"Stripe account ID","type":"text","required":true},{"key":"currency","label":"Default currency","type":"select","options":["USD","EUR","GBP","INR"],"required":true}]'::jsonb,
  '[{"version":"2.4.0","date":"2026-07-04","notes":"Payment Links API"}]'::jsonb,
  'https://docs.swiffer.io/integrations/stripe', 4.8, 2100),
('paypal', 'PayPal', 'Collect one-time and recurring PayPal payments.', 'Payments', 'PayPal', '1.1.0', false, false,
  '["payments:read","payments:write"]'::jsonb,
  '[{"key":"merchant_id","label":"Merchant ID","type":"text","required":true}]'::jsonb,
  '[{"version":"1.1.0","date":"2026-03-18","notes":"Recurring billing"}]'::jsonb,
  'https://docs.swiffer.io/integrations/paypal', 4.0, 220),
('google-drive', 'Google Drive', 'Attach and browse Drive files from conversations.', 'Storage', 'Google', '1.6.0', false, true,
  '["drive.file","drive.readonly"]'::jsonb,
  '[{"key":"root_folder","label":"Root folder ID","type":"text","required":false}]'::jsonb,
  '[{"version":"1.6.0","date":"2026-05-11","notes":"Shared drives"}]'::jsonb,
  'https://docs.swiffer.io/integrations/gdrive', 4.5, 780),
('dropbox', 'Dropbox', 'Sync attachments with Dropbox folders.', 'Storage', 'Dropbox', '1.0.4', false, false,
  '["files.content.read","files.content.write"]'::jsonb,
  '[{"key":"team_folder","label":"Team folder path","type":"text","required":false}]'::jsonb,
  '[{"version":"1.0.4","date":"2026-02-22","notes":"Team spaces"}]'::jsonb,
  'https://docs.swiffer.io/integrations/dropbox', 4.2, 310),
('google-calendar', 'Google Calendar', 'Turn meetings and follow-ups into Calendar events.', 'Productivity', 'Google', '1.3.0', false, true,
  '["calendar.events.write","calendar.readonly"]'::jsonb,
  '[{"key":"default_calendar","label":"Default calendar","type":"text","required":true}]'::jsonb,
  '[{"version":"1.3.0","date":"2026-04-19","notes":"Recurring events"}]'::jsonb,
  'https://docs.swiffer.io/integrations/gcal', 4.6, 640),
('notion', 'Notion', 'Push meeting notes and CRM data into Notion databases.', 'Productivity', 'Notion Labs', '1.1.0', false, false,
  '["database:read","database:write"]'::jsonb,
  '[{"key":"database_id","label":"Database ID","type":"text","required":true}]'::jsonb,
  '[{"version":"1.1.0","date":"2026-03-08","notes":"Rich text blocks"}]'::jsonb,
  'https://docs.swiffer.io/integrations/notion', 4.4, 500),
('openai', 'OpenAI', 'Use your OpenAI account for AI replies and summaries.', 'AI', 'OpenAI', '2.0.0', true, true,
  '["chat.completions","embeddings"]'::jsonb,
  '[{"key":"model","label":"Default model","type":"select","options":["gpt-4o","gpt-4o-mini","gpt-4.1"],"required":true}]'::jsonb,
  '[{"version":"2.0.0","date":"2026-06-30","notes":"Realtime API"}]'::jsonb,
  'https://docs.swiffer.io/integrations/openai', 4.9, 4500),
('anthropic', 'Anthropic Claude', 'Route AI actions to Claude models.', 'AI', 'Anthropic', '1.2.0', true, false,
  '["messages:create"]'::jsonb,
  '[{"key":"model","label":"Default model","type":"select","options":["claude-sonnet-4.5","claude-opus-4","claude-haiku-4"],"required":true}]'::jsonb,
  '[{"version":"1.2.0","date":"2026-05-25","notes":"Extended thinking"}]'::jsonb,
  'https://docs.swiffer.io/integrations/anthropic', 4.8, 1800),
('mixpanel', 'Mixpanel', 'Stream product events into Mixpanel projects.', 'Analytics', 'Mixpanel', '1.0.2', false, false,
  '["events:write"]'::jsonb,
  '[{"key":"project_token","label":"Project token","type":"text","required":true}]'::jsonb,
  '[{"version":"1.0.2","date":"2026-01-14","notes":"EU residency"}]'::jsonb,
  'https://docs.swiffer.io/integrations/mixpanel', 4.1, 260),
('segment', 'Segment', 'Fan out CRM events through Segment.', 'Analytics', 'Twilio', '1.4.0', false, true,
  '["source:write"]'::jsonb,
  '[{"key":"write_key","label":"Source write key","type":"text","required":true}]'::jsonb,
  '[{"version":"1.4.0","date":"2026-05-02","notes":"Server-side sources"}]'::jsonb,
  'https://docs.swiffer.io/integrations/segment', 4.5, 470),
('quickbooks', 'QuickBooks Online', 'Sync invoices and payments with QuickBooks.', 'Accounting', 'Intuit', '1.3.0', false, true,
  '["accounting:read","accounting:write"]'::jsonb,
  '[{"key":"realm_id","label":"Company realm ID","type":"text","required":true}]'::jsonb,
  '[{"version":"1.3.0","date":"2026-04-27","notes":"Class tracking"}]'::jsonb,
  'https://docs.swiffer.io/integrations/quickbooks', 4.4, 380),
('xero', 'Xero', 'Bi-directional Xero accounting sync.', 'Accounting', 'Xero', '1.1.0', false, false,
  '["accounting.transactions","accounting.contacts"]'::jsonb,
  '[{"key":"tenant_id","label":"Tenant ID","type":"text","required":true}]'::jsonb,
  '[{"version":"1.1.0","date":"2026-03-30","notes":"Bank reconciliation"}]'::jsonb,
  'https://docs.swiffer.io/integrations/xero', 4.3, 210),
('zapier', 'Zapier', 'Trigger 6000+ apps from Swiffer events.', 'Automation', 'Zapier', '2.0.0', true, true,
  '["triggers:read","actions:write"]'::jsonb,
  '[{"key":"zap_id","label":"Zap ID","type":"text","required":false}]'::jsonb,
  '[{"version":"2.0.0","date":"2026-06-10","notes":"Public app v2"}]'::jsonb,
  'https://docs.swiffer.io/integrations/zapier', 4.7, 2900),
('make', 'Make', 'Automate workflows with Make scenarios.', 'Automation', 'Celonis', '1.0.1', false, false,
  '["scenarios:run"]'::jsonb,
  '[{"key":"team_id","label":"Team ID","type":"text","required":true}]'::jsonb,
  '[{"version":"1.0.1","date":"2026-02-05","notes":"European datacenter"}]'::jsonb,
  'https://docs.swiffer.io/integrations/make', 4.2, 340),
('n8n', 'n8n', 'Self-hosted automation with n8n.', 'Automation', 'n8n GmbH', '1.5.0', false, true,
  '["workflows:execute"]'::jsonb,
  '[{"key":"webhook_url","label":"n8n webhook URL","type":"text","required":true}]'::jsonb,
  '[{"version":"1.5.0","date":"2026-05-15","notes":"OAuth support"}]'::jsonb,
  'https://docs.swiffer.io/integrations/n8n', 4.6, 610);
