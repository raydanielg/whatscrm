
-- 1. Add missing columns to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ticket_number bigint,
  ADD COLUMN IF NOT EXISTS parent_ticket_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_conv_ticket_number ON public.conversations(workspace_id, ticket_number);
CREATE INDEX IF NOT EXISTS idx_conv_parent ON public.conversations(parent_ticket_id);
CREATE INDEX IF NOT EXISTS idx_conv_merged ON public.conversations(merged_into_id);
CREATE INDEX IF NOT EXISTS idx_conv_tags ON public.conversations USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_conv_custom ON public.conversations USING gin(custom_fields);

-- 2. Ticket number counter table
CREATE TABLE IF NOT EXISTS public.ticket_counters (
  workspace_id uuid PRIMARY KEY,
  next_number bigint NOT NULL DEFAULT 1
);
GRANT SELECT, INSERT, UPDATE ON public.ticket_counters TO authenticated;
GRANT ALL ON public.ticket_counters TO service_role;
ALTER TABLE public.ticket_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members read counters" ON public.ticket_counters
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_counters.workspace_id AND wm.user_id = auth.uid()));

-- 3. Function to assign ticket_number
CREATE OR REPLACE FUNCTION public.assign_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num bigint;
BEGIN
  IF NEW.ticket_number IS NOT NULL THEN RETURN NEW; END IF;
  INSERT INTO public.ticket_counters(workspace_id, next_number)
    VALUES (NEW.workspace_id, 2)
    ON CONFLICT (workspace_id) DO UPDATE SET next_number = ticket_counters.next_number + 1
    RETURNING next_number - 1 INTO next_num;
  NEW.ticket_number := next_num;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_ticket_number ON public.conversations;
CREATE TRIGGER trg_assign_ticket_number
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.assign_ticket_number();

-- 4. Backfill numbers for existing rows
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT DISTINCT workspace_id FROM public.conversations WHERE ticket_number IS NULL LOOP
    n := COALESCE((SELECT MAX(ticket_number) FROM public.conversations WHERE workspace_id = r.workspace_id), 0) + 1;
    UPDATE public.conversations c
      SET ticket_number = sub.rn
      FROM (
        SELECT id, (n - 1 + ROW_NUMBER() OVER (ORDER BY created_at)) AS rn
        FROM public.conversations
        WHERE workspace_id = r.workspace_id AND ticket_number IS NULL
      ) sub
      WHERE c.id = sub.id;
    INSERT INTO public.ticket_counters(workspace_id, next_number)
      VALUES (r.workspace_id, COALESCE((SELECT MAX(ticket_number) FROM public.conversations WHERE workspace_id = r.workspace_id), 0) + 1)
      ON CONFLICT (workspace_id) DO UPDATE SET next_number = EXCLUDED.next_number;
  END LOOP;
END $$;

-- 5. Ticket activity timeline
CREATE TABLE IF NOT EXISTS public.ticket_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  ticket_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_type text NOT NULL DEFAULT 'agent', -- agent|customer|system|ai|workflow
  action text NOT NULL, -- created|updated|assigned|status_changed|priority_changed|merged|split|linked|tagged|note_added|deleted|restored
  from_value jsonb,
  to_value jsonb,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ticket_activity TO authenticated;
GRANT ALL ON public.ticket_activity TO service_role;
ALTER TABLE public.ticket_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members view ticket_activity" ON public.ticket_activity
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_activity.workspace_id AND wm.user_id = auth.uid()));
CREATE POLICY "ws members insert ticket_activity" ON public.ticket_activity
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = ticket_activity.workspace_id AND wm.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON public.ticket_activity(ticket_id, created_at DESC);

-- 6. Realtime
DO $$ BEGIN
  BEGIN EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_activity'; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
