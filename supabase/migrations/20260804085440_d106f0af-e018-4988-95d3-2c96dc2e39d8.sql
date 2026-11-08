CREATE OR REPLACE FUNCTION public.tg_widget_typing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec record;
  conv uuid;
  actor uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    conv := OLD.conversation_id; actor := OLD.user_id;
  ELSE
    conv := NEW.conversation_id; actor := NEW.user_id;
  END IF;
  IF conv IS NULL THEN RETURN NULL; END IF;
  -- Skip echoes of the visitor's own typing (visitor writes with user_id = session id).
  IF EXISTS (SELECT 1 FROM public.chatbot_sessions s WHERE s.id = actor) THEN
    RETURN NULL;
  END IF;
  FOR rec IN SELECT id FROM public.chatbot_sessions WHERE conversation_id = conv LOOP
    PERFORM public.widget_broadcast(rec.id, 'typing');
  END LOOP;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_widget_typing_aiud ON public.conversation_typing;
CREATE TRIGGER tg_widget_typing_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.conversation_typing
FOR EACH ROW EXECUTE FUNCTION public.tg_widget_typing();