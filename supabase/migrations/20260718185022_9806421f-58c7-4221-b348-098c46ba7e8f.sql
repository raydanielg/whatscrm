
ALTER TABLE public.livechat_visitors
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS first_referrer TEXT,
  ADD COLUMN IF NOT EXISTS last_referrer TEXT,
  ADD COLUMN IF NOT EXISTS first_page TEXT,
  ADD COLUMN IF NOT EXISTS last_page TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT;

CREATE INDEX IF NOT EXISTS idx_livechat_visitors_email ON public.livechat_visitors (workspace_id, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_livechat_visitors_phone ON public.livechat_visitors (workspace_id, phone) WHERE phone IS NOT NULL;
