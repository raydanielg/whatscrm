DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='chatbot_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chatbot_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='chatbot_sessions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chatbot_sessions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='handoff_queue') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.handoff_queue;
  END IF;
END $$;

ALTER TABLE public.chatbot_messages REPLICA IDENTITY FULL;
ALTER TABLE public.chatbot_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.handoff_queue REPLICA IDENTITY FULL;