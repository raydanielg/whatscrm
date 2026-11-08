
-- ============ SLA POLICIES ============
CREATE TABLE public.sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  inbox_ids uuid[] NOT NULL DEFAULT '{}',
  priorities conversation_priority[] NOT NULL DEFAULT ARRAY['low','normal','high','urgent']::conversation_priority[],
  first_response_minutes integer,
  response_minutes integer,
  resolution_minutes integer,
  business_hours_only boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  priority_rank integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_policies TO authenticated;
GRANT ALL ON public.sla_policies TO service_role;
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_policies read" ON public.sla_policies FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "sla_policies admin write" ON public.sla_policies FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE INDEX idx_sla_policies_ws ON public.sla_policies(workspace_id, is_active, priority_rank);
CREATE TRIGGER trg_sla_policies_updated BEFORE UPDATE ON public.sla_policies FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ CONVERSATION SLA ============
CREATE TABLE public.conversation_sla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
  policy_id uuid REFERENCES public.sla_policies(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  first_response_due_at timestamptz,
  next_response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_response_at timestamptz,
  first_response_breached_at timestamptz,
  response_breached_at timestamptz,
  resolution_breached_at timestamptz,
  is_paused boolean NOT NULL DEFAULT false,
  paused_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_sla TO authenticated;
GRANT ALL ON public.conversation_sla TO service_role;
ALTER TABLE public.conversation_sla ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conversation_sla ws" ON public.conversation_sla FOR ALL TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE INDEX idx_conv_sla_conv ON public.conversation_sla(conversation_id);
CREATE INDEX idx_conv_sla_due ON public.conversation_sla(workspace_id, resolution_due_at) WHERE resolution_breached_at IS NULL;
CREATE TRIGGER trg_conv_sla_updated BEFORE UPDATE ON public.conversation_sla FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_sla;

-- ============ ASSIGNMENT RULES ============
CREATE TABLE public.assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  inbox_id uuid REFERENCES public.inboxes(id) ON DELETE CASCADE,
  strategy text NOT NULL DEFAULT 'manual' CHECK (strategy IN ('manual','round_robin','load_balanced')),
  is_active boolean NOT NULL DEFAULT true,
  round_robin_cursor integer NOT NULL DEFAULT 0,
  max_open_per_agent integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, inbox_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_rules TO authenticated;
GRANT ALL ON public.assignment_rules TO service_role;
ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assignment_rules read" ON public.assignment_rules FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "assignment_rules admin write" ON public.assignment_rules FOR ALL TO authenticated
  USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]))
  WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner'::workspace_role,'admin'::workspace_role]));
CREATE TRIGGER trg_assignment_rules_updated BEFORE UPDATE ON public.assignment_rules FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ FUNCTIONS ============
-- Assign a conversation to a user (RLS-safe: verifies caller is workspace member)
CREATE OR REPLACE FUNCTION public.assign_conversation(_conversation_id uuid, _assignee uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ws uuid;
BEGIN
  SELECT workspace_id INTO _ws FROM public.conversations WHERE id = _conversation_id;
  IF _ws IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF NOT public.is_workspace_member(_ws, auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE public.conversations SET assigned_to = _assignee, assigned_at = now(), updated_at = now()
    WHERE id = _conversation_id;
END $$;

-- Auto-assign using rule strategy
CREATE OR REPLACE FUNCTION public.auto_assign_conversation(_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ws uuid; _inbox uuid; _rule public.assignment_rules%ROWTYPE;
  _agents uuid[]; _picked uuid; _idx int;
BEGIN
  SELECT workspace_id, inbox_id INTO _ws, _inbox FROM public.conversations WHERE id = _conversation_id;
  IF _ws IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF NOT public.is_workspace_member(_ws, auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  SELECT * INTO _rule FROM public.assignment_rules
    WHERE workspace_id = _ws AND (inbox_id = _inbox OR inbox_id IS NULL) AND is_active
    ORDER BY inbox_id NULLS LAST LIMIT 1;

  IF _rule IS NULL OR _rule.strategy = 'manual' THEN RETURN NULL; END IF;

  -- Candidate agents = inbox members (fallback to workspace members if no inbox scope)
  IF _inbox IS NOT NULL THEN
    SELECT array_agg(user_id ORDER BY user_id) INTO _agents FROM public.inbox_members WHERE inbox_id = _inbox;
  END IF;
  IF _agents IS NULL OR array_length(_agents,1) IS NULL THEN
    SELECT array_agg(user_id ORDER BY user_id) INTO _agents
    FROM public.workspace_members WHERE workspace_id = _ws AND status = 'active';
  END IF;
  IF _agents IS NULL OR array_length(_agents,1) IS NULL THEN RETURN NULL; END IF;

  IF _rule.strategy = 'round_robin' THEN
    _idx := (_rule.round_robin_cursor % array_length(_agents,1)) + 1;
    _picked := _agents[_idx];
    UPDATE public.assignment_rules SET round_robin_cursor = _rule.round_robin_cursor + 1 WHERE id = _rule.id;
  ELSIF _rule.strategy = 'load_balanced' THEN
    SELECT a INTO _picked
    FROM unnest(_agents) a
    LEFT JOIN LATERAL (
      SELECT count(*) AS n FROM public.conversations c
      WHERE c.assigned_to = a AND c.workspace_id = _ws AND c.status IN ('open','pending') AND c.deleted_at IS NULL
    ) load ON true
    ORDER BY load.n ASC NULLS FIRST, a
    LIMIT 1;
  END IF;

  IF _picked IS NOT NULL THEN
    UPDATE public.conversations SET assigned_to = _picked, assigned_at = now(), updated_at = now()
      WHERE id = _conversation_id;
  END IF;
  RETURN _picked;
END $$;

-- Apply matching SLA policy to a conversation
CREATE OR REPLACE FUNCTION public.apply_sla_to_conversation(_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ws uuid; _inbox uuid; _pri conversation_priority; _now timestamptz := now();
  _p public.sla_policies%ROWTYPE;
BEGIN
  SELECT workspace_id, inbox_id, priority INTO _ws, _inbox, _pri
    FROM public.conversations WHERE id = _conversation_id;
  IF _ws IS NULL THEN RAISE EXCEPTION 'Conversation not found'; END IF;
  IF NOT public.is_workspace_member(_ws, auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;

  SELECT * INTO _p FROM public.sla_policies
    WHERE workspace_id = _ws AND is_active
      AND (array_length(inbox_ids,1) IS NULL OR _inbox = ANY(inbox_ids))
      AND _pri = ANY(priorities)
    ORDER BY priority_rank ASC, created_at ASC
    LIMIT 1;
  IF _p IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.conversation_sla(workspace_id, conversation_id, policy_id, started_at,
    first_response_due_at, next_response_due_at, resolution_due_at)
  VALUES (_ws, _conversation_id, _p.id, _now,
    CASE WHEN _p.first_response_minutes IS NOT NULL THEN _now + make_interval(mins => _p.first_response_minutes) END,
    CASE WHEN _p.response_minutes IS NOT NULL THEN _now + make_interval(mins => _p.response_minutes) END,
    CASE WHEN _p.resolution_minutes IS NOT NULL THEN _now + make_interval(mins => _p.resolution_minutes) END)
  ON CONFLICT (conversation_id) DO UPDATE SET
    policy_id = EXCLUDED.policy_id,
    first_response_due_at = COALESCE(public.conversation_sla.first_response_due_at, EXCLUDED.first_response_due_at),
    next_response_due_at = EXCLUDED.next_response_due_at,
    resolution_due_at = EXCLUDED.resolution_due_at,
    updated_at = now();
  RETURN _p.id;
END $$;

-- Trigger: on inbound message start SLA; on outbound agent message clear first response + roll next response window
CREATE OR REPLACE FUNCTION public.tg_sla_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ws uuid; _inbox uuid; _pri conversation_priority; _p public.sla_policies%ROWTYPE; _now timestamptz := now();
BEGIN
  IF NEW.is_internal THEN RETURN NEW; END IF;
  SELECT workspace_id, inbox_id, priority INTO _ws, _inbox, _pri
    FROM public.conversations WHERE id = NEW.conversation_id;

  IF NEW.direction::text = 'inbound' THEN
    -- ensure a tracker exists
    IF NOT EXISTS (SELECT 1 FROM public.conversation_sla WHERE conversation_id = NEW.conversation_id) THEN
      SELECT * INTO _p FROM public.sla_policies
        WHERE workspace_id = _ws AND is_active
          AND (array_length(inbox_ids,1) IS NULL OR _inbox = ANY(inbox_ids))
          AND _pri = ANY(priorities)
        ORDER BY priority_rank ASC, created_at ASC LIMIT 1;
      IF _p IS NOT NULL THEN
        INSERT INTO public.conversation_sla(workspace_id, conversation_id, policy_id, started_at,
          first_response_due_at, next_response_due_at, resolution_due_at)
        VALUES (_ws, NEW.conversation_id, _p.id, _now,
          CASE WHEN _p.first_response_minutes IS NOT NULL THEN _now + make_interval(mins => _p.first_response_minutes) END,
          CASE WHEN _p.response_minutes IS NOT NULL THEN _now + make_interval(mins => _p.response_minutes) END,
          CASE WHEN _p.resolution_minutes IS NOT NULL THEN _now + make_interval(mins => _p.resolution_minutes) END)
        ON CONFLICT (conversation_id) DO NOTHING;
      END IF;
    ELSE
      -- roll next response due
      UPDATE public.conversation_sla cs
        SET next_response_due_at = _now + make_interval(mins => COALESCE(p.response_minutes, 60)),
            updated_at = now()
        FROM public.sla_policies p
        WHERE cs.conversation_id = NEW.conversation_id AND cs.policy_id = p.id;
    END IF;
  ELSIF NEW.direction::text = 'outbound' THEN
    UPDATE public.conversation_sla
      SET first_response_at = COALESCE(first_response_at, _now),
          next_response_due_at = NULL,
          updated_at = now()
      WHERE conversation_id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sla_on_message ON public.messages;
CREATE TRIGGER trg_sla_on_message AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_sla_on_message();

-- Trigger: when conversation resolved, stop SLA
CREATE OR REPLACE FUNCTION public.tg_sla_on_conv_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status::text = 'resolved' AND OLD.status::text <> 'resolved' THEN
    UPDATE public.conversation_sla
      SET resolution_due_at = NULL, next_response_due_at = NULL, is_paused = true, paused_at = now(), updated_at = now()
      WHERE conversation_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sla_on_conv_status ON public.conversations;
CREATE TRIGGER trg_sla_on_conv_status AFTER UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.tg_sla_on_conv_status();
