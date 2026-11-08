REVOKE ALL ON FUNCTION public.widget_broadcast(uuid, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_widget_chatbot_message() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_widget_inbox_message() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_widget_conversation_status() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_widget_session_status() FROM anon, authenticated;