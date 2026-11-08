
-- ============ INBOX CORE ARCHITECTURE ============

-- Enums
DO $$ BEGIN
  CREATE TYPE public.inbox_channel AS ENUM ('whatsapp','email','sms','webchat','instagram','messenger','telegram','voice','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.conversation_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.message_type AS ENUM ('text','image','video','audio','document','location','contact','template','sticker','system','interactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Extend conversation_status enum if needed
DO $$ BEGIN
  ALTER TYPE public.conversation_status ADD VALUE IF NOT EXISTS 'snoozed';
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.conversation_status ADD VALUE IF NOT EXISTS 'pending';
EXCEPTION WHEN others THEN NULL; END $$;

-- ============ INBOXES ============
CREATE TABLE IF NOT EXISTS public.inboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  channel public.inbox_channel NOT NULL DEFAULT 'whatsapp',
  color text,
  icon text,
  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  auto_assignment_enabled boolean NOT NULL DEFAULT false,
  auto_assignment_strategy text,
  business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inboxes TO authenticated;
GRANT ALL ON public.inboxes TO service_role;
ALTER TABLE public.inboxes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox members read" ON public.inboxes FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "inbox admins write" ON public.inboxes FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE INDEX IF NOT EXISTS idx_inboxes_ws ON public.inboxes(workspace_id) WHERE NOT is_archived;
CREATE TRIGGER trg_inboxes_updated_at BEFORE UPDATE ON public.inboxes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ INBOX MEMBERS ============
CREATE TABLE IF NOT EXISTS public.inbox_members (
  inbox_id uuid NOT NULL REFERENCES public.inboxes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'agent',
  notifications_enabled boolean NOT NULL DEFAULT true,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (inbox_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inbox_members TO authenticated;
GRANT ALL ON public.inbox_members TO service_role;
ALTER TABLE public.inbox_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inbox members visible in workspace" ON public.inbox_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inboxes i WHERE i.id = inbox_id AND public.is_workspace_member(i.workspace_id, auth.uid())));
CREATE POLICY "inbox admins manage members" ON public.inbox_members FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inboxes i WHERE i.id = inbox_id AND public.has_workspace_role(i.workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inboxes i WHERE i.id = inbox_id AND public.has_workspace_role(i.workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role])));
CREATE INDEX IF NOT EXISTS idx_inbox_members_user ON public.inbox_members(user_id);

-- Security-definer helper for conversation/message RLS without recursion
CREATE OR REPLACE FUNCTION public.is_inbox_member(_inbox_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.inbox_members WHERE inbox_id = _inbox_id AND user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.inboxes i WHERE i.id = _inbox_id AND public.has_workspace_role(i.workspace_id, _user_id, ARRAY['owner'::workspace_role,'admin'::workspace_role]));
$$;

-- ============ EXTEND CONVERSATIONS ============
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS inbox_id uuid REFERENCES public.inboxes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel public.inbox_channel NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS priority public.conversation_priority NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS last_message_from text,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_team_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_conversation_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conv_inbox_last_msg ON public.conversations(inbox_id, last_message_at DESC NULLS LAST) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conv_ws_status_last ON public.conversations(workspace_id, status, last_message_at DESC NULLS LAST) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conv_assigned ON public.conversations(assigned_to, status) WHERE assigned_to IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conv_contact ON public.conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conv_snoozed ON public.conversations(snoozed_until) WHERE snoozed_until IS NOT NULL;

-- ============ EXTEND MESSAGES ============
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type public.message_type NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS from_address text,
  ADD COLUMN IF NOT EXISTS to_address text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_size bigint,
  ADD COLUMN IF NOT EXISTS media_thumbnail_url text,
  ADD COLUMN IF NOT EXISTS media_duration_seconds integer,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_reason text,
  ADD COLUMN IF NOT EXISTS client_temp_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_msg_conv_created ON public.messages(conversation_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_msg_ws_created ON public.messages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_provider_id ON public.messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_msg_client_temp ON public.messages(conversation_id, client_temp_id) WHERE client_temp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_msg_body_trgm ON public.messages USING gin (body gin_trgm_ops) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_msg_updated_at ON public.messages;
CREATE TRIGGER trg_msg_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ MESSAGE ATTACHMENTS ============
CREATE TABLE IF NOT EXISTS public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  file_id uuid REFERENCES public.files(id) ON DELETE SET NULL,
  url text,
  mime_type text,
  file_name text,
  size_bytes bigint,
  width integer,
  height integer,
  duration_seconds integer,
  thumbnail_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_attachments TO authenticated;
GRANT ALL ON public.message_attachments TO service_role;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message attachments follow workspace" ON public.message_attachments FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX IF NOT EXISTS idx_msg_att_msg ON public.message_attachments(message_id);

-- ============ CONVERSATION PARTICIPANTS ============
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'watcher',
  last_read_at timestamptz,
  last_typed_at timestamptz,
  is_muted boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  CHECK ((user_id IS NOT NULL) OR (contact_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_conv_part_user ON public.conversation_participants(conversation_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_conv_part_contact ON public.conversation_participants(conversation_id, contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conv_part_user ON public.conversation_participants(user_id) WHERE user_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_participants TO authenticated;
GRANT ALL ON public.conversation_participants TO service_role;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "participants workspace" ON public.conversation_participants FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ CONVERSATION ASSIGNMENTS (history) ============
CREATE TABLE IF NOT EXISTS public.conversation_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_team_id uuid,
  reason text,
  is_current boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_conv_assign_current ON public.conversation_assignments(conversation_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS idx_conv_assign_user ON public.conversation_assignments(assigned_to, is_current);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_assignments TO authenticated;
GRANT ALL ON public.conversation_assignments TO service_role;
ALTER TABLE public.conversation_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignments workspace" ON public.conversation_assignments FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ INTERNAL NOTES ============
CREATE TABLE IF NOT EXISTS public.conversation_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}'::uuid[],
  is_pinned boolean NOT NULL DEFAULT false,
  pinned_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_notes_conv ON public.conversation_notes(conversation_id, created_at DESC) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_notes TO authenticated;
GRANT ALL ON public.conversation_notes TO service_role;
ALTER TABLE public.conversation_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv notes workspace read" ON public.conversation_notes FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "conv notes author write" ON public.conversation_notes FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()) AND author_id = auth.uid());
CREATE POLICY "conv notes author update" ON public.conversation_notes FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "conv notes admin delete" ON public.conversation_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE TRIGGER trg_conv_notes_updated_at BEFORE UPDATE ON public.conversation_notes FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ LABELS ============
CREATE TABLE IF NOT EXISTS public.conversation_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  color text,
  description text,
  parent_id uuid REFERENCES public.conversation_labels(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_labels TO authenticated;
GRANT ALL ON public.conversation_labels TO service_role;
ALTER TABLE public.conversation_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "labels workspace read" ON public.conversation_labels FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "labels workspace write" ON public.conversation_labels FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE TRIGGER trg_conv_labels_updated_at BEFORE UPDATE ON public.conversation_labels FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.conversation_label_assignments (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.conversation_labels(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, label_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_label_label ON public.conversation_label_assignments(label_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_label_assignments TO authenticated;
GRANT ALL ON public.conversation_label_assignments TO service_role;
ALTER TABLE public.conversation_label_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "label assignments workspace" ON public.conversation_label_assignments FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ MESSAGE READ RECEIPTS (per user) ============
CREATE TABLE IF NOT EXISTS public.message_read_receipts (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_msg_read_user ON public.message_read_receipts(user_id, read_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_read_receipts TO authenticated;
GRANT ALL ON public.message_read_receipts TO service_role;
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read receipts own" ON public.message_read_receipts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));

-- ============ CONVERSATION ACTIVITY (audit trail) ============
CREATE TABLE IF NOT EXISTS public.conversation_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conv_activity_conv ON public.conversation_activity(conversation_id, created_at DESC);
GRANT SELECT, INSERT ON public.conversation_activity TO authenticated;
GRANT ALL ON public.conversation_activity TO service_role;
ALTER TABLE public.conversation_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv activity workspace" ON public.conversation_activity FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "conv activity insert" ON public.conversation_activity FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- ============ TYPING INDICATORS (ephemeral) ============
CREATE TABLE IF NOT EXISTS public.conversation_typing (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 seconds'),
  PRIMARY KEY (conversation_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_typing TO authenticated;
GRANT ALL ON public.conversation_typing TO service_role;
ALTER TABLE public.conversation_typing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "typing workspace" ON public.conversation_typing FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_workspace_member(workspace_id, auth.uid()));

-- ============ CONVERSATION RLS (workspace-scoped read, agent-scoped write) ============
-- Drop old permissive policies if exist and add new
DROP POLICY IF EXISTS "conv workspace all" ON public.conversations;
DROP POLICY IF EXISTS "msg workspace all" ON public.messages;

CREATE POLICY "conversations workspace read" ON public.conversations FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) AND deleted_at IS NULL);
CREATE POLICY "conversations workspace write" ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "conversations workspace update" ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "conversations admin delete" ON public.conversations FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

CREATE POLICY "messages workspace read" ON public.messages FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()) AND deleted_at IS NULL);
CREATE POLICY "messages workspace insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "messages workspace update" ON public.messages FOR UPDATE TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "messages admin delete" ON public.messages FOR DELETE TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));

-- ============ TRIGGERS: keep conversation summary/counters up to date ============
CREATE OR REPLACE FUNCTION public.tg_message_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_internal THEN RETURN NEW; END IF;
  UPDATE public.conversations c
    SET last_message_at = NEW.created_at,
        last_message_preview = left(coalesce(NEW.body, NEW.message_type::text), 200),
        last_message_from = CASE WHEN NEW.direction::text = 'inbound' THEN 'contact' ELSE 'agent' END,
        unread_count = CASE WHEN NEW.direction::text = 'inbound' THEN c.unread_count + 1 ELSE c.unread_count END,
        first_response_at = CASE
          WHEN c.first_response_at IS NULL AND NEW.direction::text = 'outbound' THEN NEW.created_at
          ELSE c.first_response_at END,
        updated_at = now()
    WHERE c.id = NEW.conversation_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_message_after_insert ON public.messages;
CREATE TRIGGER trg_message_after_insert AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_message_after_insert();

-- Assignment history mirror
CREATE OR REPLACE FUNCTION public.tg_conversation_assignment_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    UPDATE public.conversation_assignments
      SET is_current = false, unassigned_at = now()
      WHERE conversation_id = NEW.id AND is_current;
    IF NEW.assigned_to IS NOT NULL THEN
      INSERT INTO public.conversation_assignments(workspace_id, conversation_id, assigned_to, assigned_by, is_current)
      VALUES (NEW.workspace_id, NEW.id, NEW.assigned_to, auth.uid(), true);
      NEW.assigned_at := now();
    END IF;
    INSERT INTO public.conversation_activity(workspace_id, conversation_id, actor_id, activity_type, data)
    VALUES (NEW.workspace_id, NEW.id, auth.uid(), 'assignment_changed',
      jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text = 'resolved' AND OLD.status::text <> 'resolved' THEN
      NEW.resolved_at := now();
      NEW.resolved_by := auth.uid();
    END IF;
    INSERT INTO public.conversation_activity(workspace_id, conversation_id, actor_id, activity_type, data)
    VALUES (NEW.workspace_id, NEW.id, auth.uid(), 'status_changed',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_conv_assign_history ON public.conversations;
CREATE TRIGGER trg_conv_assign_history BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_conversation_assignment_history();

-- ============ REALTIME PUBLICATION ============
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.message_attachments; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_assignments; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_notes; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_labels; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_label_assignments; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_activity; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_typing; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.message_read_receipts; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inboxes; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_members; EXCEPTION WHEN others THEN NULL; END $$;

ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_label_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_typing REPLICA IDENTITY FULL;
ALTER TABLE public.message_read_receipts REPLICA IDENTITY FULL;
