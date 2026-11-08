
ALTER TABLE public.booking_event_types
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS preparation_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_participants integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_group boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS availability_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_booking_event_types_workspace_active
  ON public.booking_event_types (workspace_id, is_active);
