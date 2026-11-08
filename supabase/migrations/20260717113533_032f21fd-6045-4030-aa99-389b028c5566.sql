
-- Realtime coverage for tag & customization tables so tags/custom fields sync live everywhere
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_tag_assignments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_tags;            EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_segments;        EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.custom_field_definitions; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.files;               EXCEPTION WHEN duplicate_object THEN NULL; END;
END$$;

-- REPLICA IDENTITY FULL so subscribers receive the old row on UPDATE/DELETE (needed for tag removals to broadcast cleanly)
ALTER TABLE public.crm_tag_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.crm_tags            REPLICA IDENTITY FULL;
ALTER TABLE public.crm_segments        REPLICA IDENTITY FULL;
ALTER TABLE public.custom_field_definitions REPLICA IDENTITY FULL;

-- Faster global search on leads (trigram) + compound index for upcoming tasks dashboard widget
CREATE INDEX IF NOT EXISTS idx_leads_first_name_trgm ON public.leads USING gin (first_name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_last_name_trgm  ON public.leads USING gin (last_name public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_email_trgm      ON public.leads USING gin (email public.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_company_trgm    ON public.leads USING gin (company_name public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_tasks_ws_status_due
  ON public.tasks (workspace_id, status, due_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_deals_ws_status_stage
  ON public.deals (workspace_id, status, stage_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_ws_last_message
  ON public.conversations (workspace_id, last_message_at DESC NULLS LAST);

-- Compound index that speeds up "activity timeline for a specific record"
CREATE INDEX IF NOT EXISTS idx_activities_target_created
  ON public.activities (workspace_id, target_type, target_id, created_at DESC);
