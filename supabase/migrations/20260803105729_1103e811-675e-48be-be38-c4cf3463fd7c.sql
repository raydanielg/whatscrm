-- 1. Broadcast helper: notify a widget session channel that something changed.
CREATE OR REPLACE FUNCTION public.widget_broadcast(_session_id uuid, _kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, realtime
AS $$
BEGIN
  IF _session_id IS NULL THEN RETURN; END IF;
  PERFORM realtime.send(
    jsonb_build_object('kind', _kind, 'session_id', _session_id, 'at', now()),
    'widget_update',
    'widget:' || _session_id::text,
    true
  );
END;
$$;

-- 2. Chatbot messages -> notify that session.
CREATE OR REPLACE FUNCTION public.tg_widget_chatbot_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.widget_broadcast(NEW.session_id, 'message');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS widget_broadcast_chatbot_message ON public.chatbot_messages;
CREATE TRIGGER widget_broadcast_chatbot_message
AFTER INSERT ON public.chatbot_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_widget_chatbot_message();

-- 3. Inbox messages (agent replies) -> notify any widget session on that conversation.
CREATE OR REPLACE FUNCTION public.tg_widget_inbox_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s record;
BEGIN
  IF NEW.conversation_id IS NULL THEN RETURN NEW; END IF;
  FOR s IN SELECT id FROM public.chatbot_sessions WHERE conversation_id = NEW.conversation_id LOOP
    PERFORM public.widget_broadcast(s.id, 'message');
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS widget_broadcast_inbox_message ON public.messages;
CREATE TRIGGER widget_broadcast_inbox_message
AFTER INSERT OR UPDATE OF read_at, body ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.tg_widget_inbox_message();

-- 4. Conversation handoff / assignment changes -> notify status.
CREATE OR REPLACE FUNCTION public.tg_widget_conversation_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE s record;
BEGIN
  IF NEW.handoff_state IS NOT DISTINCT FROM OLD.handoff_state
     AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;
  FOR s IN SELECT id FROM public.chatbot_sessions WHERE conversation_id = NEW.id LOOP
    PERFORM public.widget_broadcast(s.id, 'status');
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS widget_broadcast_conversation_status ON public.conversations;
CREATE TRIGGER widget_broadcast_conversation_status
AFTER UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.tg_widget_conversation_status();

-- 5. Session status changes (e.g. handed_off) -> notify status.
CREATE OR REPLACE FUNCTION public.tg_widget_session_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id THEN
    PERFORM public.widget_broadcast(NEW.id, 'status');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS widget_broadcast_session_status ON public.chatbot_sessions;
CREATE TRIGGER widget_broadcast_session_status
AFTER UPDATE ON public.chatbot_sessions
FOR EACH ROW EXECUTE FUNCTION public.tg_widget_session_status();

-- 6. Allow anonymous widget visitors to subscribe ONLY to an existing widget
--    session topic. Session ids are unguessable UUIDs and the payload carries
--    no conversation content — the widget still re-fetches through its
--    signed public endpoints.
CREATE OR REPLACE FUNCTION public.widget_topic_allowed(_topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _topic LIKE 'widget:%'
     AND EXISTS (
       SELECT 1 FROM public.chatbot_sessions s
       WHERE s.id::text = substring(_topic from 8)
     );
$$;

DROP POLICY IF EXISTS "realtime messages: widget visitors read own session" ON realtime.messages;
CREATE POLICY "realtime messages: widget visitors read own session"
ON realtime.messages
FOR SELECT
TO anon, authenticated
USING (public.widget_topic_allowed((SELECT realtime.topic())));