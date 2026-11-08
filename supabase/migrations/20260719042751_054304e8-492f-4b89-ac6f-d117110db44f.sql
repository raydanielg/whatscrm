
-- =============================================================================
-- Phase 19 — Appointment Booking & Scheduling
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 1. Event types --------------------------------------------------------------
CREATE TABLE public.booking_event_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  duration_minutes integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  buffer_before_minutes integer NOT NULL DEFAULT 0,
  buffer_after_minutes integer NOT NULL DEFAULT 0,
  min_notice_minutes integer NOT NULL DEFAULT 60,
  max_advance_days integer NOT NULL DEFAULT 60,
  location_kind text NOT NULL DEFAULT 'custom',
  location_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  price numeric(12,2),
  currency text DEFAULT 'USD',
  color text DEFAULT '#A4161A',
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  redirect_url text,
  confirmation_message text,
  reminder_policy jsonb NOT NULL DEFAULT '[{"offset":1440,"channel":"email"},{"offset":60,"channel":"email"}]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_event_types TO authenticated;
GRANT SELECT ON public.booking_event_types TO anon;
GRANT ALL ON public.booking_event_types TO service_role;
ALTER TABLE public.booking_event_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage event types"
  ON public.booking_event_types FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "public can read active event types"
  ON public.booking_event_types FOR SELECT TO anon
  USING (is_active = true);

-- 2. Availability schedules ---------------------------------------------------
CREATE TABLE public.booking_availability_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Working hours',
  timezone text NOT NULL DEFAULT 'UTC',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_availability_schedules TO authenticated;
GRANT ALL ON public.booking_availability_schedules TO service_role;
ALTER TABLE public.booking_availability_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage schedules"
  ON public.booking_availability_schedules FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- 3. Availability slots (weekly template) -------------------------------------
CREATE TABLE public.booking_availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.booking_availability_schedules(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_availability_slots TO authenticated;
GRANT ALL ON public.booking_availability_slots TO service_role;
ALTER TABLE public.booking_availability_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage slots via schedule"
  ON public.booking_availability_slots FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.booking_availability_schedules s
    WHERE s.id = schedule_id AND public.is_workspace_member(s.workspace_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.booking_availability_schedules s
    WHERE s.id = schedule_id AND public.is_workspace_member(s.workspace_id, auth.uid())
  ));

-- 4. Availability overrides ---------------------------------------------------
CREATE TABLE public.booking_availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  host_id uuid NOT NULL,
  override_date date NOT NULL,
  is_blocked boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (host_id, override_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_availability_overrides TO authenticated;
GRANT ALL ON public.booking_availability_overrides TO service_role;
ALTER TABLE public.booking_availability_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage overrides"
  ON public.booking_availability_overrides FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- 5. Event type hosts ---------------------------------------------------------
CREATE TABLE public.booking_event_type_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_id uuid NOT NULL REFERENCES public.booking_event_types(id) ON DELETE CASCADE,
  host_id uuid NOT NULL,
  schedule_id uuid REFERENCES public.booking_availability_schedules(id) ON DELETE SET NULL,
  strategy text NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin','collective','first_available')),
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_type_id, host_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_event_type_hosts TO authenticated;
GRANT SELECT ON public.booking_event_type_hosts TO anon;
GRANT ALL ON public.booking_event_type_hosts TO service_role;
ALTER TABLE public.booking_event_type_hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage event type hosts"
  ON public.booking_event_type_hosts FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.booking_event_types et
    WHERE et.id = event_type_id AND public.is_workspace_member(et.workspace_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.booking_event_types et
    WHERE et.id = event_type_id AND public.is_workspace_member(et.workspace_id, auth.uid())
  ));

CREATE POLICY "public reads hosts of active event types"
  ON public.booking_event_type_hosts FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.booking_event_types et
    WHERE et.id = event_type_id AND et.is_active = true
  ));

-- 6. Appointments -------------------------------------------------------------
CREATE TABLE public.booking_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_type_id uuid REFERENCES public.booking_event_types(id) ON DELETE SET NULL,
  host_id uuid NOT NULL,
  contact_id uuid,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  customer_timezone text NOT NULL DEFAULT 'UTC',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','cancelled','no_show','completed','rescheduled')),
  source_channel text NOT NULL DEFAULT 'booking_page',
  source_conversation_id uuid,
  join_url text,
  location_kind text,
  location_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  cancellation_reason text,
  reschedule_of uuid REFERENCES public.booking_appointments(id) ON DELETE SET NULL,
  external_event_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  manage_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24),'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

ALTER TABLE public.booking_appointments
  ADD CONSTRAINT booking_no_double_book EXCLUDE USING gist (
    host_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status IN ('pending','confirmed'));

CREATE INDEX booking_appointments_workspace_start_idx
  ON public.booking_appointments (workspace_id, start_at DESC);
CREATE INDEX booking_appointments_host_start_idx
  ON public.booking_appointments (host_id, start_at);
CREATE UNIQUE INDEX booking_appointments_manage_token_idx
  ON public.booking_appointments (manage_token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_appointments TO authenticated;
GRANT ALL ON public.booking_appointments TO service_role;
ALTER TABLE public.booking_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage appointments"
  ON public.booking_appointments FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- 7. Reminders ----------------------------------------------------------------
CREATE TABLE public.booking_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.booking_appointments(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  channel text NOT NULL,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX booking_reminders_due_idx
  ON public.booking_reminders (send_at) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_reminders TO authenticated;
GRANT ALL ON public.booking_reminders TO service_role;
ALTER TABLE public.booking_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage reminders"
  ON public.booking_reminders FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- 8. Booking pages ------------------------------------------------------------
CREATE TABLE public.booking_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_type_ids uuid[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  logo_url text,
  brand_color text DEFAULT '#A4161A',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_pages TO authenticated;
GRANT SELECT ON public.booking_pages TO anon;
GRANT ALL ON public.booking_pages TO service_role;
ALTER TABLE public.booking_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage booking pages"
  ON public.booking_pages FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "public reads active booking pages"
  ON public.booking_pages FOR SELECT TO anon
  USING (is_active = true);

-- 9. Waitlist -----------------------------------------------------------------
CREATE TABLE public.booking_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  event_type_id uuid NOT NULL REFERENCES public.booking_event_types(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  desired_start_at timestamptz,
  desired_end_at timestamptz,
  notes text,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','offered','booked','expired','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.booking_waitlist TO authenticated;
GRANT ALL ON public.booking_waitlist TO service_role;
ALTER TABLE public.booking_waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage waitlist"
  ON public.booking_waitlist FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- 10. updated_at triggers -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.booking_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_booking_event_types_touch BEFORE UPDATE ON public.booking_event_types
  FOR EACH ROW EXECUTE FUNCTION public.booking_touch_updated_at();
CREATE TRIGGER trg_booking_schedules_touch BEFORE UPDATE ON public.booking_availability_schedules
  FOR EACH ROW EXECUTE FUNCTION public.booking_touch_updated_at();
CREATE TRIGGER trg_booking_appts_touch BEFORE UPDATE ON public.booking_appointments
  FOR EACH ROW EXECUTE FUNCTION public.booking_touch_updated_at();
CREATE TRIGGER trg_booking_pages_touch BEFORE UPDATE ON public.booking_pages
  FOR EACH ROW EXECUTE FUNCTION public.booking_touch_updated_at();

-- 11. Realtime ----------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_reminders;
